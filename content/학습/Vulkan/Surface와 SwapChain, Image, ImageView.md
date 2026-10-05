---
title: "Surface와 SwapChain, Image, ImageView"
description: ""
date: "2026-10-02T23:21:28+09:00"
draft: false
tags: []
---
### Surface

윈도우 시스템과 연결하여 렌더링 결과를 보여주려면 surface를 만들어야 합니다.


저는 [[Instance 초기화#2. 필요한 InstanceExtension 확인]]에서도 언급했듯이 win32 환경이고, 암시적으로 활성화했었습니다.

따라서 이 문서에서는 win32 환경에서 연결하기 위한 작업을 설명할 것입니다.

win32 surface를 생성하려면, `vulkan_win32.h`를 인클루드 해야 합니다.
그래야 `vkCreateWin32SurfaceKHR`를 사용할 수 있습니다.

생성 시 VkWin32SurfaceCreateInfoKHR 구조체에 정보를 넘겨줘야 하는데,
app 시작 시 얻은 hInstance와, 윈도우 창을 만들면서 얻은 HWND 값을 넘겨주면 됩니다.


surface를 생성했으면 swapchain도 조만간 생성하게 될 텐데 취급 시 주의 사항이 있습니다.
내용이 많지 않으니 다음 swapchain 문단을 읽어보세요.

### Swapchain 

swapchain은 화면(surface)에 표시 가능한 이미지들을 추상화 한 것입니다.
또, 이 swapchain은 프레젠테이션 엔진이 관리합니다.
프레젠테이션 엔진은 크로노스 쪽에서 설명을 위해 별칭으로 부르고 있습니다.
[spec - VkSwapchainKHR](https://docs.vulkan.org/refpages/latest/refpages/source/VkSwapchainKHR.html)

swapchain을 만들 때 앞서 만든 surface를 넘겨주게 됩니다.
이렇게 surface를 연결하고 swapchain을 만들면, 제거할 때 swapchain을 먼저 제거하고 surface를 제거해야 합니다.

surface는 swapchain이 제거될 때까지 유지되어야 하는 제약이 있습니다.
[spec - vkCreateSwapchainKHR](https://docs.vulkan.org/refpages/latest/refpages/source/vkCreateSwapchainKHR.html)

사실 swapchain을 만들기 위해 수많은 정보들을 얻어와서 순회하며 적절한 값을 찾아야 합니다.

그러나, 이 작업들은 튜토리얼들을 잘 따라가면 되므로, 특별히 이 문서에서 공유할 정보는 없었습니다. (나중에 vulkan에 익숙해지면서 추가될 수 있습니다.)

아래는 스펙 찾아가면서 코드를 짜니 이런 게 있었다는 느낌으로 공유합니다.
vkGetPhysicalDeviceSurfaceCapabilitiesKHR는 레거시가 되어 vkGetPhysicalDeviceSurfaceCapabilities2KHR로 확장되었습니다.
[spec - vkGetPhysicalDeviceSurfaceCapabilitiesKHR](https://docs.vulkan.org/refpages/latest/refpages/source/vkGetPhysicalDeviceSurfaceCapabilitiesKHR.html)

### Image와 ImageView

image는 D3D11의 render target 혹은 ID3D11Texture2D라고 이해할 수 있을 것 같습니다.
opengl은 이런 개념이 없지만, D3D11에서는 초기화 단계에서 swapchain에서 이미지를 얻어와 렌더타겟으로 만드는 작업이 있는데, 이와 유사했습니다.

ImageView 역시 D3D11의 ID3D11xxxView 개체들과 동일하다고 이해했습니다.
실제로 공식 tutorial에서도 이미지를 어떻게 사용할지, 어떻게 읽을지, 어느 부분에 접근할지와 같은 view라는 식으로 설명합니다.

Image들은 swapchain에서 얻어올 수 있습니다.
한 두장이 아니라 여러 장이 될 수 있습니다.

이렇게 얻어온 image를 가지고 ImageView로 만들어 둡니다.

Image와 ImageView는 이후 RenderLoop에서 활용할 것입니다.


여기에서 얻어온 Image들은 swapchain이 제거될 때 같이 제거됩니다.(애초에 swapchain이 내부적으로 가지고 있는 image들입니다.)
그러나 ImageView는 앱에서 만든 것이므로 직접 제거해 줘야 합니다.
