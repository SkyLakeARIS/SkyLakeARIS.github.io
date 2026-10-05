---
title: "Render Loop"
description: ""
date: "2026-10-02T23:27:40+09:00"
draft: false
tags: []
---
### RenderLoop의 큰 흐름
[[기본 개념과 큰 흐름#튜토리얼이 안내하는 초기화 과정|기본 개념과 큰 흐름]] 문서에서도 가볍게 다뤘지만, 이 문서에서 좀 더 상세하게 다룹니다.

renderLoop는 영어로 적거나 한글로 적거나 섞어 표기할 예정입니다.


큰 흐름은 대략 이렇습니다.
* RenderLoop 
1. 이전 프레임 작업 완료 대기(CPU-GPU 대기)
2. SwapChain에서 현재 프레임에서 사용할 Image 얻기 ( GPU에서 일어나는 일)
3. CommandBuffer 기록 시작
4. ImageLayoutTransition
5. Rendering 시작(DynamicRendering일 때)
6. Commands 기록
7. Rendering 끝(DynamicRendering일 때)
8. ImageLayoutTransition
9. CommandBuffer 기록 끝
10. CommandBuffer 제출 (GPU에서 일어나는 일)
11. SwapChainImagePresent (GPU에서 일어나는 일)


기본 개념에서 다루었던 과정과 비교하면 거짓말을 했다고 했을 정도로 뭐가 많이 추가되었습니다.

이 글을 작성하는 시점에서는 포팅 단계에서 기본적인 윈도우와의 연결 단계를 완료한 단계인데, 기본적인 작업을 진행했을 뿐인데도 이 정도입니다.


특히 과정 뒤에 괄호로 뭐라 뭐라 적었는데 일단은 대충 뭔가 있구나만 생각하시고
아래에서 하나씩 정리하겠습니다.



#### 이전 프레임 작업 완료 대기(CPU-GPU 대기)
이 작업은 렌더 루프의 시작으로 이전 프레임 작업을 대기해야 합니다.

[[CommandPool과 CommandBuffer, Queue]] 문서에서도 다뤘듯이, vulkan을 포함한 차세대 api에서는 명령을 제출해도 GPU가 실제로 그 명령을 완료했는지 알 수 없습니다.(드라이버가 GPU와 app 단의 작업을 동기화 시켜주지 않기 때문에 이 역할은 개발자의 몫입니다)
따라서 
1. 동기화 객체를 통해서 어떤 작업이 끝났는지 알아내야 한다는 점.
2. GPU가 명령을 처리하고 있을 수 있기 때문에 commandBuffer를 유지해야 한다는 점.
이 있습니다.

위와 같은 이유로 이전 프레임 작업이 끝날 때까지 fence를 사용하여 대기합니다.

사실 이렇게 하면 꽤 느릴 것이므로 [[CommandPool과 CommandBuffer, Queue#프레임 중첩하기(중첩 렌더링)와 주의 사항|CommandPool과 CommandBuffer, Queue]] 문서에서 다룬 것처럼 중첩 렌더링을 사용합니다.


대략 코드는 아래와 같습니다.
```
    void VkRenderer::WaitForLastFrame() const
    {
        const PerFrame curFrame = getCurrentFrameResource();
        // wait 1sec = 1'000'000'000
        const VkResult result = vkWaitForFences(mDevice, 1, &curFrame.DrawFinishedFence, VK_TRUE, 1'000'000'000); 
        if (result != VK_SUCCESS)
        {
            ASSERT(false, "Fence Wait LastFrame 실패 resultCode(%d)", result);
        }
        // Fence가 성공하면 Reset을 잊지 말아야 합니다
        (void)vkResetFences(mDevice, 1, &curFrame.DrawFinishedFence);
    }
```


중요한 점은 fence를 사용하고, reset 해야 하는 것을 잊으면 안 됩니다.
또한, app이 처음 실행되면 fence도 신호를 받은 적도, command를 제출한 적도 없으므로 초기값을 signaled 상태로 fence를 생성해야 한다는 점을 잊으면 안 됩니다.



#### SwapChain에서 Image 얻어오기

렌더링 하려면 당연히 렌더타겟이 있어야 합니다. 그러나, D3D11처럼 그냥 렌더타겟에 그린 다음, present 하면 끝이 아닙니다.

vulkan에서는 swapChain에서 이 image들을 가지고 있고, 화면에 표시를 담당하는 프레젠테이션 엔진이 swapChain을 관리한다고 합니다.(프레젠테이션 엔진은 크로노스 쪽에서 설명 편의상 부르는 이름 같습니다.)

따라서 렌더타겟인 image에 렌더링 하려면 먼저 swapChain에서 image를 얻어와야 합니다.
정확히는 image의 index를 얻어옵니다.

얻어오는 API는 `vkAcquireNextImage2KHR` 입니다.

하지만 이 imageIndex를 그냥 얻어와서 바로 쓸 수 있는 것은 아닙니다.
swapChain이 가진 image들 일부는 화면에 표시되고 있거나 표시 대기 중 일 수도 있으므로 써도 되는 image에 렌더링을 해야 합니다.
프레젠테이션 엔진이 사용할 수 있는 imageIndex를 반환한다고는 하지만, 여전히 화면에 표시되고 있는 중일 수 있으므로 이 표시가 끝났는지 확인(대기)가 필요합니다.

위에서 적었던 (GPU에서 일어나는 일)이라고 괄호를 달아놨었는데, 바로 이와 관련된 내용을 표현하기 위해 적어놨었습니다.

이 끝났는지 확인하는 작업은 fence를 써도 되고, semaphore를 써도 되지만, GPU에서 일어나는 일이기 때문에 굳이 CPU를 기다리게 할 이유는 없으므로 semaphore를 사용하여 swapChain에서 image를 얻어옵니다.

정리하면 아래와 같습니다.
swapChain에서 얻어오는 것은 imageIndex이다.
이 얻어오는 작업은 GPU에서 일어나는 일이다.
imageIndex에 해당하는 image가 사용 중일 수 있으므로 semaphore를 사용하여 대기한다.

이 fence, semaphore에 관련된 내용은 [[Fence와 Semaphore]] 문서를 참고하세요.

코드로 표현하면 아래와 같습니다.
```
    uint32_t VkRenderer::acquireSwapChainImage(const PerFrame& frame)
    {
        uint32_t nextImageIndex = UINT32_MAX;
        VkAcquireNextImageInfoKHR acqNextImageInfo{};
        acqNextImageInfo.sType = VK_STRUCTURE_TYPE_ACQUIRE_NEXT_IMAGE_INFO_KHR;
        // 확실히 가용 가능한 상태가 되었는지 시그널을 줄 세마포어,
        acqNextImageInfo.semaphore = frame.ImageReadySemaphore;
        // 어느 Swapchain에서 얻어올 것인지?
        acqNextImageInfo.swapchain = mSwapChain;
        // 나노 초 단위이며, UINT64_MAX는 무한 대기.
        acqNextImageInfo.timeout = 1'000'000'000; // 1sec
        // PhysicalDevice의 마스크, 보통 GPU는 한개 이므로 1.
        //  여러 개 사용하면 BitMask로 구분이 필요하다.
        acqNextImageInfo.deviceMask = 1;
		// vulkan api 1.1부터 확장을 통해 사용할 수 있습니다.
        const VkResult result = vkAcquireNextImage2KHR(mDevice, &acqNextImageInfo, &nextImageIndex);
        if (result != VK_SUCCESS)
        {
            ASSERT(false, "next image 획득 실패 resultCode(%d)", result);
        }
        ASSERT(nextImageIndex < mImages.size(), "유효하지 않은 image Index를 획득했거나, index 획득에 실패했습니다.  nextImageIndex(%u)", nextImageIndex);
        return nextImageIndex;
    }
```



#### CommandBuffer 기록 시작

[[CommandPool과 CommandBuffer, Queue]] 문서에서 설명했던 것처럼,
queue에 명령들을 제출하려면, commandBuffer에 command들을 기록해야 합니다.

관련 API는 `vkBeginCommandBuffer`를 사용합니다.
이 단계에서 commandBuffer는 recording 상태가 되어 기록이 가능합니다. 
이래야 이후 단계에서 queue에 제출했을 때 문제가 없습니다.

recording 상태로 만들 때 buffer를 어떻게 쓸 것인지 flag를 지정하는데, 각자의 용도에 맞게 지정할 수 있습니다.
한 프레임 내 여러 번 제출하거나, 한 번만 제출하거나 하는 것을 지정하는 플래그입니다.
관련 spec 문서: [spec - VkCommandBufferUsageFlagBits](https://docs.vulkan.org/refpages/latest/refpages/source/VkCommandBufferUsageFlagBits.html)

이런 형태의 코드입니다.
```
        VkCommandBufferBeginInfo commandBufferBeginInfo{};
        commandBufferBeginInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;
        commandBufferBeginInfo.flags = VkCommandBufferUsageFlagBits::VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
        // MEMO: 암묵적 초기화
        const VkResult result = vkBeginCommandBuffer(curFrame.Buffer, &commandBufferBeginInfo);
        if (result != VK_SUCCESS)
        {
            ASSERT(false, "vkBeginCommandBuffer 실패 resultCode(%d)", result);
        }
```
위 코드에서 `vkResetCommandBuffer`를 통해서 buffer의 상태를 다시 원복 해줘야 하지만, 공식 튜토리얼에서는 `vkBeginCommandBuffer`가 묵시적으로 다시 상태를 리셋해 준다고 하여 따로 과정을 넣지 않았습니다.

`vkBeginCommandBuffer`은 `vkEndCommandBuffer`와 짝이므로 잊지 마세요.



#### ImageLayoutTransition 

swapChain에서 얻은 이미지를 사용하려면 이 이미지의 layout을 사용하려는 목적에 맞게 용도를 변경한다고 알려주는 과정입니다. 
이를 layoutTransition이라고 합니다.
이렇게 적절한 layout을 지정했을 때 내부적으로 성능 향상 효과를 기대할 수 있다고 합니다.


진행하기 전에 하나 짚고 넘어가면 앞서 `vkBeginCommandBuffer`를 호출했던 만큼 이 작업도 일종의 command라고 생각할 수 있다는 점을 짚고 넘어가야 합니다.


layoutTransition을 할 때는 `vkCmdPipelineBarrier2`와 `VkImageMemoryBarrier2`를 사용하여 진행합니다.

VkImageMemoryBarrier2에 대한 자세한 내용은 spec 및 아래 문서를 참고하세요.
[[ImageLayout과 Transition]]

이 문서에서는 간단하게 언급하면,
VkImageMemoryBarrier2의 구조체에서 srcLayout과 dstLayout을 지정하는데, 
뭐에서 뭘로 바꿀거냐라는 이해로 받아들이면 되지 않을까 합니다.

이 단계에서는 아래와 같이 지정합니다.
src -> dst
VK_IMAGE_LAYOUT_UNDEFINED -> VK_IMAGE_LAYOUT_GENERAL 

VK_IMAGE_LAYOUT_GENERAL은 거의 모든 유형의 그래픽스 작업에 유효합니다.
한마디로 "모르겠으면 일단 이거 써라."라고 생각하고 이후에 천천히 공부해 볼 수 있습니다.

특히 dynamicRendering을 사용할 경우 VK_IMAGE_LAYOUT_GENERAL를 지정해야 검증 레이어를 통과했습니다. (에러에 대해 약간의 조건이 있긴 합니다.)

대략 코드는 이렇습니다.
제 경우, transitionImageLayout 함수 내부는 튜토리얼의 구현을 따랐습니다.
```
transitionImageLayout(curFrame.Buffer, mCurImageIndex,
// oldLayout -> newLayout
VK_IMAGE_LAYOUT_UNDEFINED,
VK_IMAGE_LAYOUT_GENERAL,
// srcAccessMask -> dstAccessMask
VK_ACCESS_2_NONE,
VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT , 
// srcStageMask -> dstStageMask       
VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT);
```

자세한 플래그들은 spec 문서들을 참고하세요.
[[ImageLayout과 Transition]]에도 관련 spec 문서를 링크했습니다



#### Rendering 시작(DynamicRendering일 때)

이 과정은 dynamicRendering을 사용하면 사용하는 API입니다.
`vkCmdBeginRendering`를 사용합니다.

이를 dynamicRendering 방식으로 렌더 패스를 시작한다는 느낌입니다.
API 버전 1.3 이상을 사용한다고 해도, feature를 활성화 해야 하므로 잊지 않았는지 확인해야 합니다.

이 함수를 통해 어떤 이미지 뷰에, 어떤 레이아웃, 로드할 때는 어떤 작업을, 끝나면 어떤 작업을 할지 등등을 지정해 주게 됩니다.

어떤 레이아웃의 경우에는 앞서 imageLayoutTransition 과정에서 dstLayout으로 설정한 flag와 같이 맞춰줘야 합니다.

또한, 당연히 `vkCmdEndRendering`과 짝이므로 잊지 마세요.

대략 코드는 이렇습니다. 자세한 설명은 생략하겠습니다.
```
        constexpr VkClearValue ClearColorValue{0.4f, 0.8f, 0.6f, 1.0f};

        VkRenderingAttachmentInfo renderingAttachmentInfo{};
        renderingAttachmentInfo.sType = VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO;
        renderingAttachmentInfo.imageLayout = VK_IMAGE_LAYOUT_GENERAL;
        renderingAttachmentInfo.imageView = mImageViews[mCurImageIndex];
        renderingAttachmentInfo.loadOp = VkAttachmentLoadOp::VK_ATTACHMENT_LOAD_OP_CLEAR;
        renderingAttachmentInfo.storeOp = VkAttachmentStoreOp::VK_ATTACHMENT_STORE_OP_STORE;
        renderingAttachmentInfo.clearValue = ClearColorValue;

        VkRenderingInfo renderingInfo{};
        renderingInfo.sType = VK_STRUCTURE_TYPE_RENDERING_INFO;
        renderingInfo.pColorAttachments = &renderingAttachmentInfo;
        renderingInfo.colorAttachmentCount = 1;
        renderingInfo.layerCount = 1;
        renderingInfo.renderArea = { {0, 0}, mSwapChainExtent };
        vkCmdBeginRendering(curFrame.Buffer, &renderingInfo);
```



#### Commands 기록
이제 commandBuffer도 recording 상태이고, command들을 기록하기 위한 절차는 끝났으므로
각 프로젝트의 로직을 수행하면서 command들을 기록하면 됩니다.

문서 작성 시점의 저는 무언가 띄우기보다 우선 윈도우 화면과 연결하여 빈 화면 출력이 목적이었으므로 별다른 command를 추가하지 않았습니다.


이런 command들을 기록할 때는 `vkCmd**` 형식의 API들을 사용한다고 합니다.



#### Rendering 끝(DynamicRendering일 때)

다시 집중할 때가 왔습니다.

앞서 `vkCmdBeginRendering`을 호출했으므로 `vkCmdEndRendering`을 호출하여 짝을 맞춰줘야 합니다.
그렇지 않으면 검증 레이어에서 에러가 발생합니다.

따로 할 건 없고 간단하게 commandBuffer 핸들만 넘겨주면 됩니다.

```
vkCmdEndRendering(curFrame.Buffer);
```



#### ImageLayoutTransition

여기에서 또 imageLayoutTransition을 수행합니다.

이제 commandBuffer 기록이 끝났으므로 제출을 할 것이고, queue에 제출이 되면 명령들이 실행되어 image에 렌더링 될 것이고 최종적으로 present가 될 것입니다.

이 작업은 이 이미지에 렌더링 작업이 끝나고 present할 때에 대한 layout을 지정하는 작업입니다.

그래서 commandBuffer의 가장 마지막 command로 제출이 됩니다.

코드는 대략 이렇습니다.
```
        transitionImageLayout(curFrame.Buffer, mCurImageIndex, 
// oldLayout -> newLayout
VK_IMAGE_LAYOUT_GENERAL,
VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
// srcAccessMask -> dstAccessMask
VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
VK_ACCESS_2_NONE,
// srcStageMask -> dstStageMask   
VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT, VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT);

```
`vkBeginCommandBuffer` 당시에 dstLayout을 VK_IMAGE_LAYOUT_GENERAL로 지정했으므로 
이 단계에서 srcLayout은 VK_IMAGE_LAYOUT_GENERAL입니다.

이 작업은 맨 마지막에 수행되어야 하므로 맨 마지막 command로 삽입된 것인데,
엄밀하게 같은 queue에 전달된 작업들은 또 내부적으로 비 순차로 실행될 수 있습니다.
그래서 transition 작업에 pipelineBarrier를 사용하는 이유입니다.
자세한 내용은 아래 문서를 참고하세요.
[[PipelineBarrier와 실행·메모리 의존성]]



#### CommandBuffer 기록 끝내기

이제 완전히 command 기록이 끝났으므로, `vkEndCommandBuffer`를 호출합니다.
이렇게 되면 commandBuffer는 executable 상태가 됩니다.


코드는 이렇게 핸들만 전달하게 됩니다.
```
        vkEndCommandBuffer(curFrame.Buffer);
```




#### Queue로 CommandBuffer 제출 (GPU에서 일어나는 일)

commandBuffer 기록이 끝났고, 상태도 바꿨으므로 이제 queue에 제출하여 GPU에게 실행해달라고 하면 됩니다.
[[CommandPool과 CommandBuffer, Queue]]에서 언급되었듯이, 이때 command들에 대한 검증이 진행됩니다.

`vkQueueSubmit2`를 호출하여 command들을 제출할 수 있고, 이렇게 되면 commandBuffer는 pending 상태로 바뀝니다.

command를 기록하는 작업은 비용이 싸지만 제출 작업은 검증도 포함되어 있으므로 꽤 비싼 비용이라고 합니다.

코드는 대략 아래와 같습니다.
```
        VkCommandBufferSubmitInfo commandBufferSubmitInfo{};
        commandBufferSubmitInfo.sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO;
        commandBufferSubmitInfo.commandBuffer = curFrame.Buffer;

		// Command들을 전부 처리했을 때 보내줄 시그널에 대한 info
        VkSemaphoreSubmitInfo renderFinishedSubmitInfo{};
        renderFinishedSubmitInfo.sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO;
        renderFinishedSubmitInfo.semaphore = curFrame.RenderFinishedSemaphore;
        renderFinishedSubmitInfo.stageMask = VK_PIPELINE_STAGE_2_ALL_GRAPHICS_BIT;
        renderFinishedSubmitInfo.value = 1;

		// Command를 실행하기 전에 Image가 사용가능함을 알기 위해
		// 기다릴 시그널에 대한 info
        VkSemaphoreSubmitInfo imageReadySubmitInfo{};
        imageReadySubmitInfo.sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO;
        imageReadySubmitInfo.semaphore = curFrame.ImageReadySemaphore;
        imageReadySubmitInfo.stageMask = VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT_KHR;
        imageReadySubmitInfo.value = 1;

        VkSubmitInfo2 submitInfo{};
        submitInfo.sType = VK_STRUCTURE_TYPE_SUBMIT_INFO_2;
        submitInfo.pCommandBufferInfos = &commandBufferSubmitInfo;
        submitInfo.commandBufferInfoCount = 1;
        submitInfo.pWaitSemaphoreInfos = &imageReadySubmitInfo;
        submitInfo.waitSemaphoreInfoCount = 1;
        submitInfo.pSignalSemaphoreInfos = &renderFinishedSubmitInfo;
        submitInfo.signalSemaphoreInfoCount = 1;
        // Fence도 여기서 지정합니다.
        vkQueueSubmit2(mQueue, 1, & submitInfo, curFrame.DrawFinishedFence);
```

이 단계에서 꽤 중요한 사항은 semaphore 지정입니다.
앞서 swapChain에서 이미지 인덱스를 얻어올 때 바로 렌더링 하면 안 된다고 했었는데,
여기에서 waitSemaphore를  acquireSwapchain에서 사용한 semaphore를 지정합니다.
그래야 렌더링을 시작하지 않습니다.

마찬가지로 렌더링이 다 끝나고 화면에 표시되어야 하므로 signal을 줄 semaphore를 하나 더 지정해야 합니다.

엄밀히는 semaphore가 보장하는 stage라는 범위가 존재하며, 그 범위만 동기화를 보장하는데, 아래 문서를 참고하세요.
[[PipelineBarrier와 실행·메모리 의존성]]

마지막으로 draw 작업이 끝났음을 알려줄 수 있는 fence도 시그널로 지정합니다.

앞서 프레임을 시작하기 전에 fence로 기다리는 신호가 바로 이것입니다.



#### ImagePresent (GPU에서 일어나는 일)

이 작업은 command가 끝나면 화면에 표시함을 지정합니다.
`vkQueuePresentKHR`를 사용합니다.

이 작업도 렌더링 중인 이미지를 화면에 표시하면 안 되므로 앞서 submit 할 때 signal을 줄 semaphore를 지정했었는데, 이 단계에서는 이 semaphore를 대기해야 합니다.

대략 코드는 아래와 같습니다.
```
        VkPresentInfoKHR presentInfo{};
        presentInfo.sType = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
        // 어떤 swapchain에 있는 이미지를 표시할 것인지?
        presentInfo.pSwapchains = &mSwapChain;
        presentInfo.swapchainCount = 1;
	    // 어느 (번째의) 이미지를 표시할 것인지?
        presentInfo.pImageIndices = &mCurImageIndex;    
        // vkQueueSubmit2 호출할 때 지정한
        // signal semaphore가 신호를 주면 화면에 표시할 수 있다.
        presentInfo.pWaitSemaphores = &curFrame.RenderFinishedSemaphore;
        presentInfo.waitSemaphoreCount = 1;

        vkQueuePresentKHR(mQueue, &presentInfo);
```

위 코드에서는 이번 프레임에서 사용한 imageIndex도 지정을 하는데, present를 하게 되면 imageIndex도 swapChain으로 반환되어 다시 프레젠테이션 엔진의 관리를 받습니다.

이 이미지들이 어떻게 표시될 건지는 여러 정책들이 존재하는데, 아래 문서를 참고하세요.
[[Surface와 SwapChain, Image, ImageView]]



### 마무리
이렇게 되면 아주 기초적인 renderLoop가 완성됩니다.
단순히 present만 하는 기능만을 위한 작업임에도 매우 할게 많고, 개념도 많다는 점이 쉽지 않습니다.(셰이더, 버텍스 설정 등등의 파이프라인 대다수의 기능 설명이 없었다는 점)

짧은 경험상 SDK 버전에 따라 검증 레이어의 로직도 계속해서 보완되고 추가되어 발생하지 않았던 에러가 발생할 수 있습니다. 이는 각자의 숙제가 될 것 같습니다.

저도 계속해서 작업하면서 마주친 에러와 해결책들은 계속해서 공유할 계획입니다.
