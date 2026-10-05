---
title: "vkQueueSubmit2 semaphore 03868 에러 관련"
description: ""
date: "2026-10-05T11:37:31+09:00"
draft: false
tags: []
---
<mark class="hl-blue">D3D11 -> Vulkan 포팅을 진행하면서 마주친 검증 레이어 에러에 대한 정보 공유 문서입니다.</mark>

제 경우에는 튜토리얼을 따라서 중첩렌더링의 프레임 수만큼 세마포어(2개)를 만들었었으나, 아래와 같은 검증 레이어 에러가 발생했습니다.
```
> `Validation Error: [ VUID-vkQueueSubmit2-semaphore-03868 ] | MessageID = 0xfbaa1e3c`
`vkQueueSubmit2(): pSubmits[0].pSignalSemaphoreInfos[0].semaphore (VkSemaphore 0x150000000015) is being signaled by VkQueue 0x299daea2890, but it may still be in use by VkSwapchainKHR 0x20000000002.`
`Most recently acquired image indices: 0, 0, 0, 0, 0, [0], 1, 1.`
`(Brackets mark the last use of VkSemaphore 0x150000000015 in a presentation operation.)`
`Swapchain image 0 was presented but was neither re-acquired nor waited on using a VK_KHR_swapchain_maintenance1 fence, so VkSemaphore 0x150000000015 may still be in use and cannot be safely reused with image index 1.`
`Hint: See https://docs.vulkan.org/guide/latest/swapchain_semaphore_reuse.html for details on swapchain semaphore reuse. Examples of possible approaches:`
   `a) Use a separate semaphore per swapchain image. Index these semaphores using the index of the acquired image.`
   `b) Consider the VK_KHR_swapchain_maintenance1 extension. It allows using a VkFence with the presentation operation.`
`The Vulkan spec states: The semaphore member of any binary semaphore element of the pSignalSemaphoreInfos member of any element of pSubmits must be unsignaled when the semaphore signal operation it defines is executed on the device (https://docs.vulkan.org/spec/latest/chapters/cmdbuffers.html#VUID-vkQueueSubmit2-semaphore-03868)`
`Objects: 2`
    `[0] VkSemaphore 0x150000000015`
    `[1] VkQueue 0x299daea2890`
```


#### 해결

조사 결과 SDK 1.4.313 버전 이후로 검증 레이어에 추가된 사항.

해결책은 딱히 정해진 것은 없지만, QueueSubmit시에 사용하는 세마포어를 swapchain image 수만큼 만들어 사용하는 것을 가장 간단한 방법으로 소개하고 있습니다.
공식 문서 - ([Guide문서-swapchain_semaphore_reuse](https://docs.vulkan.org/guide/latest/swapchain_semaphore_reuse.html))

* 그외 참고 자료
1. [Version 1.4 validation warnings](https://www.reddit.com/r/vulkan/comments/1v7uyii/version_14_validation_warnings/)
2. [\[Vk\] Fix validation VUID-vkQueueSubmit-pSignalSemaphores-00067](https://github.com/OGRECave/ogre-next/commit/71ce54a44316523c371e7269ae181b169c2e59ab)
3. [Rework semaphores for presentation to be created per swap chain image to fix validation error.](https://github.com/godotengine/godot/pull/106407/commits/ad22f654892d8426d0d71aad0c88d7ce988f68d0)


제 경우에는 공식 가이드에서 소개된 방식을 적용했습니다.


대략적으로 코드를 공유하면 아래와 같습니다.
바꾸기 전과 바꾼 후 코드를 같이 보여드리겠습니다.

Renderer.h는 아래와 같이 바꾸었습니다.
``` {hl-yellow="7,28"}
// 수정 전
        struct PerFrame
        {
            VkCommandPool Pool;
            VkCommandBuffer Buffer;
            VkSemaphore ImageReadySemaphore;
            VkSemaphore RenderFinishedSemaphore;
            VkFence DrawFinishedFence;
        };

        // MEMO: Pool-Buffer = 1:1, 더블버퍼링
        static constexpr uint8_t sOverlappedFrame = 2;
    ...
        PerFrame mFrames[sOverlappedFrame];
        uint64_t mFrameCount;
        uint32_t mCurImageIndex;
        
// 수정 후
        struct PerFrame
        {
            VkCommandPool Pool;
            VkCommandBuffer Buffer;
            VkSemaphore ImageReadySemaphore;
            VkFence DrawFinishedFence;
        };
	...
        PerFrame mFrames[sOverlappedFrame];
        std::vector<VkSemaphore> mRenderFinishedSemaphores;
	...
```

mRenderFinishedSemaphores 생성은 Renderer.cpp에서 아래와 이미지 수만큼 생성합니다
```
        mRenderFinishedSemaphores.resize(mImages.size());
        ...
```

Renderer.cpp에서 CommandBuffer를 제출하는 부분은 아래와 같습니다.
``` {hl-yellow="4,12"}
// 수정 전
VkSemaphoreSubmitInfo signalSemaphoreSubmitInfo{};
signalSemaphoreSubmitInfo.sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO;
signalSemaphoreSubmitInfo.semaphore = curFrame.RenderFinishedSemaphore;
signalSemaphoreSubmitInfo.stageMask = VK_PIPELINE_STAGE_2_ALL_GRAPHICS_BIT;
signalSemaphoreSubmitInfo.value = 1;

// 수정 후

VkSemaphoreSubmitInfo signalSemaphoreSubmitInfo{};
signalSemaphoreSubmitInfo.sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO;
signalSemaphoreSubmitInfo.semaphore = mRenderFinishedSemaphores[mCurImageIndex];
...
```

Renderer.cpp에서 Present하는 부분은 아래와 같습니다.
``` {hl-yellow="8,15,17"}
// 수정 전
VkPresentInfoKHR presentInfo{};
presentInfo.sType = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
presentInfo.pSwapchains = &mSwapChain;
presentInfo.swapchainCount = 1;
presentInfo.pImageIndices = &mCurImageIndex;
presentInfo.pWaitSemaphores = &curFrame.RenderFinishedSemaphore;
presentInfo.waitSemaphoreCount = 1;


// 수정 후

VkPresentInfoKHR presentInfo{};
...
presentInfo.pWaitSemaphores = &mRenderFinishedSemaphores[mCurImageIndex];
presentInfo.waitSemaphoreCount = 1;
```

