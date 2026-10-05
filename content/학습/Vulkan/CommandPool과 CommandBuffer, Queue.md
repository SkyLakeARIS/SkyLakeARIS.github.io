---
title: "CommandPool과 CommandBuffer, Queue"
description: ""
date: "2026-10-02T23:23:44+09:00"
draft: false
tags: []
---
### CommandPool과 CommandBuffer

commandPool은 commandBuffer를 할당하고, 명령 기록에 필요한 메모리를 관리하는 개체입니다.
commandBuffer는 그 pool에서 할당받아 명령을 기록하는 단위입니다.
메모리를 관리하는 쪽은 pool, 실제로 기록하고 제출하는 쪽은 buffer라고 나눠 이해했습니다.

renderQueue를 구현해 봤다면 commandPacket을 모아두는 것과 연관 지어 생각할 수 있을 것 같습니다.
다만 vulkan에서는 drawCall뿐 아니라 렌더 상태, viewport, barrier 같은 명령도 함께 기록합니다.


실제 메모리는 CommandPool이 관리하기 때문에 CommandBuffer는 `vkAllocateCommandBuffers`라고 명칭이 된 게 아닐까 합니다.


그리고 제거할 때도 같은 이유로 pool만 제거하면 됩니다.
buffer도 free 함수가 있긴 하지만, spec에 따르면 pool이 제거될 때 buffer도 함께 정리해 줍니다.
[spec - vkDestroyCommandPool](https://registry.khronos.org/vulkan/specs/latest/html/vkspec.html#p-vkDestroyCommandPool)


이 문단 마지막으로 튜토리얼을 따라가다 보면 놓칠 수 있는 사실들을 나열했습니다.
따라가는 것도 중요하지만, 따라가는 것에 집중하다 시야가 좁아지면 놓치는 점이 많을 테니까요.

1.
commandPool 도 생성할 때 queueFamilyIndex를 전달해야 하고, 해당하는 queue의 종류에 따른 buffer만 생성할 수 있습니다.
그리고 CommandBuffer 제출도 해당하는 queue에 제출해야 합니다.

2.
CommandBuffer는 Primary와 Secondary로 구분이 되는데,
Primary는 메인 버퍼로 유일하게 Queue에 제출할 수 있는 Buffer이고, Secondary Buffer를 실행할 수 있습니다.

Secondary는 Queue에 제출할 수 없습니다.

Secondary는 멀티 스레드 환경에서 여러 Secondary에 기록하여 Primary를 제출하는 형태로 생각할 수 있으나, 실제 spec에 의하면 멀티 스레드 환경에서 같은 pool의 buffer에 어떤 작업을 하는 것은 안전하지 않습니다.([spec - Command Buffers](https://docs.vulkan.org/spec/latest/chapters/cmdbuffers.html#commandbuffers-pools))
따라서 buffer마다 서로 다른 pool을 사용하도록 하는 방식을 사용하는 것 같습니다.

3.
`vkResetCommandBuffer`를 통해 buffer를 initial 상태로 만들 수 있습니다.
하지만, pool 생성 시 VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT 플래그를 사용하면 `vkBeginCommandBuffer` 호출만으로도 reset을 할 수 있습니다.
그밖에 상태에 대해서는 spec을 참고해보세요.([spec - Command Buffers](https://docs.vulkan.org/spec/latest/chapters/cmdbuffers.html#commandbuffers-lifecycle))


### Queue

queue는 GPU의 창구라고 볼 수 있습니다.
app은 queue를 통해서 command들을 gpu로 제출하고, gpu는 이 command들을 실행하는 개념입니다.

Queue는 Device와 `vkGetDeviceQueue2` API를 사용해 얻을 수 있습니다.

나머지 설명은 사실 튜토리얼에서 더 정확하고 깔끔하게 설명해 주기 때문에 이 문서에서는 짧게 다뤘습니다.


이 제출 관한 동작은 아래 API와 같습니다.
`vkQueueSubmit2`

물론, 제출 작업은 스레드 세이프 하지 않아서 queue에는 한 번에 하나의 스레드만 접근하는 것이 좋습니다. 멀티 스레드 환경에서 buffer를 구성할 때 유의해야 할 것입니다.

vulkan에서는 서로 다른 queue 간에는 명령들이 동시에 실행될 수 있습니다.
예를 들어 그래픽스 작업을 하는 queue와 전송을 담당하는 queue의 명령이 동시에 실행될 수 있습니다.


##### 프레임 중첩하기(중첩 렌더링)와 주의 사항
Queue에 제출했다고 끝이 아니라 GPU가 완료할 때까지 이 리소스들을 유지해야 하는 점이 문제입니다.
(재사용, 쓰기 안됨)

따라서 현재 제출한 버퍼를 다시 쓸 수 있을 때까지 기다리지 않고, 이 버퍼를 여러 개로 구성하여 프레임마다 돌아가면서 쓰는 것이 프레임 중첩(중첩 렌더링)입니다.

이렇게 자연스럽게 중첩 프레임을 배우고 데이터를 구성하게 됩니다.

제가 참고하는 튜토리얼에서는 "프레임 데이터"로 정의하여 중첩 렌더링을 구현합니다.
이 "프레임 데이터"는 CommandPool, CommandBuffer, Fence, Semaphore 두 개를 묶은 구조체의 이름입니다.


SDK1.4.313 이후로 추가된 검증 레이어의 로직에서 특정 Semaphore 재사용을 에러로 잡는 듯
보입니다.
아래 문서를 참고하세요.
[[vkQueueSubmit2-semaphore-03868 에러 관련]]
