---
title: "Instance 초기화"
description: ""
date: "2026-10-02T23:15:49+09:00"
draft: false
tags: []
---
### Instance
instance는 app 과의 vulkan 과의 연결이라고 합니다.
다르게는 어떤 api 버전을 사용하고, 어떤 기능들을 사용할 것이고, 앱 정보가 무엇인지를 가지고 있고, 이후 device 같은 여러 vk 객체들을 사용할 때 이 instance를 사용하게 됩니다.


그러나 개념 설명보다는 실제로 Instance를 초기화하는 과정과 그 과정에서 얻은 정보들을 나열하겠습니다.


Instance 초기화 과정을 위해 구조체를 채우는 작업부터 할게 많습니다.

* VkInstance 생성을 위한 단계
1. 사용할 InstanceLayer 확인
2. 필요한 InstanceExtension 확인
3. `VkApplicationInfo` 구성
4. `VkInstanceCreateInfo` 구성
5. `vkCreateInstance` 호출

4 단계를 거쳐야 겨우 하나 생성할 수 있다니 매우 끔찍합니다.


1, 2번 단계는 4번 과정에서 필요한 정보라서 수행하는 과정입니다.


### 1. 사용할 InstanceLayer 확인

layer는 vulkan API 호출 사이에 들어가 추가적인 작업을 수행하는 계층입니다.
예로 validationLayer는 호출을 가로채서(후킹) 데이터나 로직을 검증 확인하는 형식입니다.


이 단계도 두 가지 방식이 있는데,
1. 어떤 Layer들이 있는지 얻어와서, 직접 고릅니다.
2. 어떤 Layer들을 사용할 것인지 리스트를 만들어서 전달합니다.


결론부터 말씀드리면 저는 2번 방식으로 쓰고 있고, 다른 코드를 봤을 때도 이런 방식으로 쓰고 있음을 발견하여 2번 방식으로 따라갔습니다.

참고 자료는 아래입니다.
Chromium 소스 [vulkan_instance.cc](https://chromium.googlesource.com/chromium/src/+/HEAD/gpu/vulkan/vulkan_instance.cc)
> ![[Pasted image 20261004172333.png]]


제 코드는 대략 이렇습니다.
```
        constexpr const char* const RequiredLayers[] =
        {
#ifdef _DEBUG
            "VK_LAYER_KHRONOS_validation",
#endif
        };

        std::vector<const char*> instanceLayers(std::begin(RequiredLayers), std::end(RequiredLayers));
        instanceLayers.push_back(nullptr);
```

nullptr는 따로 추가하는데, 이게 다음 단계인 Extension 정보를 얻어올 때 매우 쓸모가 있는 방식입니다.

이 Layer들을 가지고 Extension 정보를 가져오기 때문에 다음 단계를 고려하면서 로직을 작성하는 것이 좋습니다.


* **정리하면**

1번은 enumerate 계열 API로 layer들을 얻어온 다음, 사용할 layer들만 추려내고, 다시 layerName들로 뽑아내야 하기 때문에 로직이 매우 복잡해집니다.

layer들을 추려내려면 결국 자신이 어떤 layer들이 각각 뭔지, 나에게 필요한지 알아야 합니다.

따라서 어차피 '내가 직접 조사해서 필요한 것을 사용한다'는 작업을 피할 수 없다면, 2번처럼 명확하게 하드코딩으로 사용할 Layer를 지정하는 게 낫다는 생각입니다.

물론, 실무에서는 다양한 환경을 대응해야 하므로 더 정교하게 체크해야 하지만 배우는 게 먼저인 단계에서 고려할 사항은 아닙니다. 


### 2. 필요한 InstanceExtension 확인

Extension의 경우에는 vulkan은 여러 환경을 지원하기 위해서 정말 최소화된 부분만 코어 스펙으로 지정하고, 그렇지 않은 것들은 KHR 확장이나 EXT 확장으로 지원한다고 합니다.

심지어는 window에 연결하기 위한 작업조차도 확장으로 분류되어 직접 활성화가 필요합니다.(window에 이미지를 보여주지 않는 서버 환경 등이 존재하기 때문이라고 합니다..)


* KHR과 EXT
KHR은 정식으로 채택된 확장입니다. 코어는 아니지만 표준화된 확장인 느낌입니다.
EXT는 각 벤더 별로 세부적인 동작이 다를 수 있는 통일되지 않은 확장인 느낌입니다.


중요한 점은 나중에 Device도 생성하는데, Device에 대한 Extension도 얻어와서 활성화해줘야 
합니다. 
처음에 이것 때문에 헷갈리는 부분이 있었는데, Instance는 앱 전역적으로, Device는 이 device 한정으로 동작하는 확장이라고 알면 좋을 것 같습니다.(다만, 양쪽에서 활성화해야 하는 것들도 있습니다.)


마무리하면, 
위 1단계에서 2번째 방식을 썼고, 벡터에 nullptr를 넣었는데, 아래와 같은 차이입니다.

1. API에 어떤 레이어 이름을 지정하면 그 레이어가 제공하는 확장을 가져옵니다.
2. nullptr를 전달하면 vulkan이 제공하는 확장과 암시적으로 활성화된 레이어들에 대한 확장만 반환됩니다.

그래서 1단계에서 사용할 Layer 리스트와 별개로 vector를 하나 더 만들어서 nullptr를 넣어준 이유가 이 단계를 위한 것입니다.

제 경우에는 아래와 같은 코드를 작성했습니다.
본문에 부연 설명을 달지 않고 코드 블록에 부연 설명을 추가했습니다.
```cpp {hl-blue="5-6,12-13,28-29"}
// 1단계에서 본 소스입니다.
        std::vector<const char*> instanceLayers(std::begin(RequiredLayers), std::end(RequiredLayers));
        instanceLayers.push_back(nullptr);

// 위와 같이 작성하면 요구하는 레이어에 대한 확장과 nullptr로 반환되는
// 암시적 확장까지 전부 가져올 수 있습니다.
        std::vector<VkExtensionProperties> extensions;
        for (const auto& layerName : instanceLayers)
        {
            const uint32_t extensionCount = extensions.size();
            uint32_t layerExtensionCount = 0;
	// vkEnumerate*** API들은 nullptr를 지정하여 필요한 갯수 정보를
	// 얻어올 수 있습니다.
            result = vkEnumerateInstanceExtensionProperties(layerName, &layerExtensionCount, nullptr);
            if (result != VK_SUCCESS)
            {
                ASSERT(false, "Instance Extensions 쿼리 실패 resultCode(%d)", result);
            }

            extensions.resize(extensionCount + layerExtensionCount);
            result = vkEnumerateInstanceExtensionProperties(layerName, &layerExtensionCount, &extensions[extensionCount]);
            if (result != VK_SUCCESS)
            {
                ASSERT(false, "Instance Extensions 구성 실패 resultCode(%d)", result);
            }
        }

// 이 작업은 구조체가 확장 이름만 받기 때문에 추가적으로 구성하는 로직입니다.
        std::vector<const char*> requiredExtensionNames;
        requiredExtensionNames.reserve(extensions.size());

        for (const auto& extension : extensions)
        {
            requiredExtensionNames.push_back(extension.extensionName);
        }

```

코드블럭 하단부에 확장 이름만 추출하는 부분에도 주목해야 합니다. 다음 단계에 필요한 작업이기 때문입니다.


사실 이렇게 하면 중복으로 구성되는 데이터가 있음을 확인했는데, 내부적으로 크게 문제 되지는 않는 것 같습니다.
참고 문서 : [vk_loader_extensions.c](https://github.com/KhronosGroup/Vulkan-Loader/blob/main/loader/generated/vk_loader_extensions.c#L17026-L17033)
물론 AI가 내부 구현만 찾은 것이므로 가능성은 낮아도 언제든지 바뀔 수 있어 보입니다.(실무에서는 유니크하게 넘기는 게 안전할 것입니다.)


* **번외 - 윈도우와 연결하기 위한 확장**

추가적으로 윈도우와 연결하려면 VK_KHR_surface 같은 확장이 필요합니다.

제 경우에는 win32와 연결하기 때문에 VK_KHR_surface와 VK_KHR_win32_surface가 필요했지만, nullptr 조회에서 전부 들어있기 때문에 명시적으로 지정하지 않았습니다.

각자 구성한 프로젝트 환경에 따라서 적절한 확장을 지정하거나, 얻어온 확장 리스트에 필요한 확장이 있는지 확인하는 것이 좋습니다.


### 3. `VkApplicationInfo` 구성

이 단계에서 설명할 것은 딱히 없습니다.
굳이 덧붙이면 이곳에서 사용할 Vulkan API 버전을 지정할 수 있는데, 매크로로 이 버전을 만들어 주기 때문에 이 매크로를 사용했습니다.
`VK_API_VERSION_1_4`

저는 1.4버전을 사용하기 때문에 위와 같은 매크로를 사용했습니다.


### 4. `VkInstanceCreateInfo` 구성

이 단계에서는 1단계에서 따로 만들었던 RequiredLayerList 를 그대로 구조체에 넘겨주고
2 단계에서 얻은 확장 이름에 대한 리스트도 전달해주면 끝입니다.


### 5. `vkCreateInstance` 호출

이제 VkInstance를 만들 수 있고, 이 단계에서는 그냥 구조체를 API에 넘겨주기만 하면 되기 때문에 설명할 것은 없습니다.


사실 구조체에 넘겨줄 데이터를 구성하는 게 가장 복잡한 일이었습니다.
