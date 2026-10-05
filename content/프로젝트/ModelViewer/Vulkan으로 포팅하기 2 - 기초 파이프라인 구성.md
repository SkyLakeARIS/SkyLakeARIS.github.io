---
title: "Vulkan으로 포팅하기 2   기초 파이프라인 구성"
description: ""
date: "2026-10-01T21:31:18+09:00"
draft: false
tags: []
---
### D3D11 에서 Vulkan으로

이 문서에서는 우선 vulkan을 사용하여 삼각형이 아닌 기본적인 윈도우와의 연결을 통해 present하는 작업을 목표로 하고 있습니다.

작업은 D3D11 API를 걷어내지 않고 vulkan API를 도입하여 작업한 후 대체하는 방식으로 진행합니다.


* **발견된 기존 구조의 문제점**
이전에 이미 renderable한 객체들의 API의존성을 제거 했습니다.
다만, Renderer가 API의 모든 것을 담당하다 보니 이를 해결하기 위해 Renderer는 상태관리만, Manager들은 생성/제거를 담당하도록 했었습니다.

그러나 이런 API를 래핑해도 발생한 문제점이 API를 교체해도 Renderer만 바뀌어야 했었는데, Manager들이 D3D API를 들고 있기 때문에 곧바로 포팅할 수 없었습니다.

실제로 바로 가져올 수 있었던 것은 FbxLoader나, Input 클래스와 같은 수준이었던 문제점이 있었습니다.

또한, 매니저에서는 RefCount를 자체 구현이 아니라 D3D의 Ref Count를 그대로 사용한 부분으로
API가 바뀌면서 작업이 필요한 문제가 있었습니다.

이에 따라 얻은 교훈은
Renderer의 API를 쉽게 교체할 수 있도록, 더 깔끔한 의존성 분리를 했어야 했다는 점.
특정 플랫폼이나 API에 의존한 로직을 구현하지 말아야 한다는 점.

현재는 vulkan 포팅 작업을 위해 학습하는 과정에 더 집중하고 있기 때문에 고민에 충분한 시간을 들이지 못하고 있지만, 이후 작업 시에는 Renderer가 생성/제거를 다시 관리하도록 하거나, Renderer와 Manager가 참조할 수 있는 별도 계층을 하나 더 두는 방향으로 고민 중입니다.
이 내용은 추후 별도 문서로 다루겠습니다.


### 작업 과정

이전부터 곧바로 Vulkan/D3D12에 뛰어들면 진입 장벽을 넘지 못할 가능성이 매우 높다는 정보들을 많이 접했었는데, 정말 그럴만한 이유가 있었습니다.
D3D11도 당시에는 만만치 않았는데, 상상했던 것보다 더 작업량이 많았습니다.

#### 디바이스 초기화

확장과 레이어에 대해서 어떻게 처리해야 괜찮은지 꽤 조사를 오래 했는데,
학습 탭의 [[Instance 초기화]] 문서에 정리했습니다.


#### win32 윈도우 연결

surface 생성 시 win32와 연결하려면, 우선 `vulkan_win32.h` 을 인클루드 했어야 했습니다.
이 부분에 대해서는 학습 탭으로 따로 분리하여 아래 문서에 정리했습니다.
[[Surface와 SwapChain, Image, ImageView#Surface]]


### 파이프라인 구성

파이프라인은 기초적으로 튜토리얼의 구성을 그대로 따랐습니다.
학습 탭의 [[Render Loop]] 문서에 정리했지만, 링크한 문서는 프로젝트의 로직(구조)을 배제했습니다.
때문에 이 문서에서는 프로젝트 구조를 반영항 파이프라인 흐름을 아래에 정리했습니다.

* **RenderLoop** 
1. 이전 프레임 작업 완료 대기(`WaitForLastFrame()`)
2. 렌더 시작(`BeginRender()`)
	1. 현재 프레임에서 사용할 프레임 데이터(Pool, Buffer ...) 가져오기
	2. Swapchain ImageIndex 획득하기(`acquireSwapChainImage()`)
	3. CommandBuffer Recording 전환(`vkBeginCommandBuffer`)
	4. 드로잉 용도로 ImageLayoutTransition(`transitionImageLayout()`)
	5. RenderPass 시작(`vkCmdBeginRendering`)
3. 커맨드 기록 시작(`renderSceneVulkan()`)
	1. 현시점 미구현
4. 렌더 종료(`EndRender()`)
	1. RenderPass 종료(`vkCmdEndRendering`)
	2. 표시용으로 ImageLayoutTransition(`transitionImageLayout()`)
	3. CommandBuffer Executable 전환(`vkEndCommandBuffer`)
5. CommandBuffer 제출()
6. Present
7. 프레임 카운트 증가()


### 마주친 문제점

이 작업을 진행하면서 마주친 검증 에러들은 아래 페이지에 정리했습니다.
특히 세마포어 재사용 관련된 문제도 있었는데, 공유를 위해 같이 정리했습니다.
[[Vulkan으로 포팅하기 3 - 오류 해결 정리]]
[[vkQueueSubmit2-semaphore-03868 에러 관련]]

### 결과

![[Pasted image 20261005135318.png]]

이렇게 win32 윈도우에 vulkan api를 연결해서 지정한 색상으로 present한 결과까지 진행했습니다.

다음 범위는 잠시 미뤄두었던 삼각형 출력을 위한 pipeline state를 진행할 차례입니다.
하지만, 삼각형이든 모델이든 본질적으로 어떤 mesh를 띄운다는 것에는 다름이 없기 때문에 저는 곧바로 기존에 사용하던 모델을 렌더링 할 것입니다.

따라서 다음 문서는 모델 렌더링을 위해 셰이더, 버텍스, 렌더 상태 설정 등을 다루는 문서가 될 예정입니다.