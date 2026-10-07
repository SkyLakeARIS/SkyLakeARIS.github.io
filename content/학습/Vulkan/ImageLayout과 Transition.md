---
title: ImageLayout과 Transition
description: ""
date: 2026-10-02T23:29:52+09:00
updated: 2026-10-07T23:59:59+09:00
draft: false
tags: []
---
### ImageLayout과 Transition
Vulkan에서는 GPU가 상황에 따라서 포멧을 바꾸기(저장) 때문에 app단에서도 Image를 어떻게 사용할 것인지에 따라서 적절한 Layout을 지정해줘야 합니다.
예로, 셰이더에서 읽기 좋은/렌더타겟에 쓰기 좋은/전송용으로 좋은 레이아웃들이 있습니다.

이 때문에 app에서 사용하려는 각 상황에 맞는 최적 성능을 위해서 ImageLayout을 적절한 Layout으로 바꿔주는 것입니다.(Layout에 따른 내부 동작은 하드웨어 구현에 따라 다르다고 합니다.)

이 ImageLayoutTransition은 PipelineBarrier를 사용해서 바꾸는데, 이 API는 동기화하는데 주로 쓰지만, ImageLayout을 바꾸는데도 사용합니다.

PipelineBarrier에 대한 설명은 아래 문서를 참고하세요.
[[PipelineBarrier와 실행·메모리 의존성]]
