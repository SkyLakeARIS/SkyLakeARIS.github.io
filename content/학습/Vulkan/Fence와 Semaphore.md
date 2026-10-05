---
title: "Fence와 Semaphore"
description: ""
date: "2026-10-02T23:24:58+09:00"
draft: false
tags: []
---
### 동기화 객체
#### Fence

CPU-GPU 동기화 옵션. 
GPU가 비동기로 돌기 때문에 작업이 완료되었는지 확인하려면 이런 동기화 객체들을 사용해서 완료되었는지 확인할 수 있습니다.(CPU를 대기시키는 것도 가능)

이전에 제출했던 CommandBuffer의 작업 완료 여부를 알기 위해 `vkQueueSubmit2` fence를 전달해주면 됩니다.

한번 쓰고 재사용하려면 VkResetFences로 반드시 리셋해줘야 합니다.


#### Semaphore
종류는 Binary와 Timeline 방식 두 개가 있습니다.
튜토리얼에서 소개되는건 Binary 방식입니다.

GPU 내부 연산 간 동기화 옵션입니다.
서로 다른 Queue 간에 동시에 실행될 수 있으므로 이 Queue간에 동기화를 위한 느낌으로 볼 수 있습니다.


생성 시 flag는 반드시 0이어야 하므로 주의.(그냥 reserved상태입니다.)


Queue에 제출된 Command들 간에 순서 제어는 pipeline barrier 개념이 필요합니다.
[[PipelineBarrier와 실행·메모리 의존성]] 문서를 참고하세요.


#### Event

존재는 확인했으나, 아직 다룬적이 없어 이후 내용 추가 예정입니다.
[spec - Synchronization and Cache Control](https://docs.vulkan.org/spec/latest/chapters/synchronization.html#synchronization-events)
