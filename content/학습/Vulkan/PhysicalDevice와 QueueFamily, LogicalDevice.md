---
title: "PhysicalDevice와 QueueFamily, LogicalDevice"
description: ""
date: "2026-10-02T23:20:25+09:00"
draft: false
tags: []
---
### PhysicalDevice

PhysicalDevice는 실제 GPU를 나타내는 객체라고 보면 될 것 같습니다.

vkEumerate API로 얻어오면 시스템에 있는 GPU 수만큼 PhysicalDevice를 얻어올 수 있습니다.
보통은 1개이겠지만, 노트북 같은 경우 2개가 될 수 있습니다.

그래서 적절한 PhysicalDevice를 선택하는 과정이 필요합니다.
디바이스가 이 앱을 구동할 수 있는지 확인하는 과정이 될 수도 있을 것입니다.

* **괜찮은 디바이스 선정하기**
이 과정에서 대부분 API들이 새로 대체된 것들이 많았습니다.
그렇다고 이전 함수를 쓰면 안 되는 것은 아니지만, 저는 확장된 버전으로 사용했습니다.

대체된 목록은 아래와 같습니다.
1. vkGetPhysicalDeviceProperties2
2. vkGetPhysicalDeviceFeatures2
3. vkGetPhysicalDeviceQueueFamilyProperties2


이 과정에서 좀 더 공유하고 싶은 내용은 아래와 같습니다.

위에 대체된 목록의 API를 보면 vkGet*** 인데, 지금껏 보통 정보를 얻어올 때에는 vkEnumerate*** API를 사용했습니다.

그리고 vkGet*** 유형의 API를 사용할 때 단순히 구조체를 넘길 때 그냥 넘기면 안 되고, 
sType에 적절한 타입을 지정해 줘야 했습니다.
특히 n 개의 데이터를 받는 경우도 마찬가지로 n 개의 데이터에 sType과 필요한 정보들을 전부 지정해 줘야 했습니다.

vkEnumerate*** 유형은 단순히 받아오기만 하면 되지만, vkGet*** 유형은 똑같이 정보를 얻어오지만 기본적인 정보를 설정해 줘야 하는 것으로 파악했습니다. (사실 다 그런 것은 아니었지만 이렇게 생각하는 게 익숙해지는데 더 편했습니다.)

참고 코드를 공유하면 아래와 같습니다.
```
            uint32_t queueFamilyCount = 0;
            vkGetPhysicalDeviceQueueFamilyProperties2(physicalDevice, &queueFamilyCount, nullptr);
            
		// 구조체에 기본적으로 sType을 지정해줘야 합니다.
            VkQueueFamilyProperties2 queueFamilyProperty{};
            queueFamilyProperty.sType = VK_STRUCTURE_TYPE_QUEUE_FAMILY_PROPERTIES_2;
            
		// 그리고 얻어온 count만큼의 데이터들에도 각각 지정합니다
            std::vector<VkQueueFamilyProperties2> queueFamilyProperties(queueFamilyCount, queueFamilyProperty);
		// 그래야 검증 레이어의 에러 없이 올바르게 정보를 받아 올 수 있습니다
            vkGetPhysicalDeviceQueueFamilyProperties2(physicalDevice, &queueFamilyCount, queueFamilyProperties.data());

```

마지막으로 괜찮은 GPU에 대해서 tutorial의 아이디어에 따라 각 physicalDevice들을 순회하면서 각 device마다 점수를 매겨 가장 높은 점수인 physicalDevice로 선택하도록 했습니다.

저는 정말 필요한 feature인데 device가 지원하지 않거나, 지원 api 버전이 낮거나 하는 등의
문제가 있으면 중단하거나, 낮은 점수를 주는 방식을 사용했습니다.


### QueueFamily
queueFamily는 같은 기능을 지원하는 queue들의 묶음이라고 볼 수 있습니다.

기능이라 함은 graphics, compute, transfer 등의 명령들이 있습니다.
보통 graphics가 저희가 하려는 렌더링과 관련된 기능을 지칭합니다.

queue라 하면 GPU에 일을 시킬 수 있는 창구와 같은데 [[CommandPool과 CommandBuffer, Queue]] 문서에서 더 자세히 설명합니다.


PhysicalDevice가 실제 GPU에 대한 정보를 담은 객체라고 설명했는데, 실제로 GPU마다 queueFamily가 지원하는 기능 종류도 다르고, 같은 기능에서 queue의 수도 다르다고 합니다.

심지어는 같은 종류의 queueFamily여도 벤더에 따라서 여러 family로 분리시키거나 할 수 있다고 합니다.
[spec - Devices and Queues](https://docs.vulkan.org/spec/latest/chapters/devsandqueues.html#devsandqueues-queueprops)


### Device
이제 Device라 하면 이 LogicalDevice를 의미합니다.

이 Device는 논리적으로 PhysicalDevice를 인스턴스화 시킨 것입니다.
따라서 하나의 PhysicalDevice에서 여러 LogicalDevice를 만들 수 있습니다.


이 Device 생성 과정에서 DeviceExtension을 또 지정해야 합니다.
전에 [[Instance 초기화#2. 필요한 InstanceExtension 확인]]에서도 언급한 바 있습니다.

InstanceExtension과 DeviceExtension은 서로 상호작용하거나 하는 관계는 아니고, 
Instance 수준의 Extension은 Instance대로, Device는 Device대로 Extension을 활성화해야 합니다.
하지만, DeviceExtension이 Instance 수준의 Extension이 활성화되어야 함을 요구하는 경우도 있습니다. (관련 [spec - Extending Vulkan](https://docs.vulkan.org/spec/latest/chapters/extensions.html#extendingvulkan-extensions-extensiondependencies))

따라서 Instance Extension을 활성화하던 것과 비슷하게 DeviceExtension도 활성화하면 됩니다.

단, 주의해야 할 점은 nullptr로 조회하게 되면 같은 유형의 확장인데도 KHR, EXT 버전이 같이 리스트로 반환되는데, KHR 버전이 있다면, EXT 버전은 활성화하지 않는 것이 좋습니다.

제 경우에는 VK_EXT_buffer_device_address 가 검증 레이어의 에러가 발생하여 VK_EXT_BUFFER_DEVICE_ADDRESS_EXTENSION_NAME인 확장은 리스트에서 제거했습니다.


또한 Feature 도 특정 API 버전에서 도입된 기능이라 하더라도 실제 app에서 사용하려면 활성화해야 합니다.
잊지 말고 조회하여 활성화해야 합니다.

제 경우에는 아래와 같이 체이닝하여 사용 가능한 모든 feature를 활성화했습니다.
```
        VkPhysicalDeviceVulkan11Features deviceFeatures11{};
        deviceFeatures11.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_1_FEATURES;
        VkPhysicalDeviceVulkan12Features deviceFeatures12{};
        deviceFeatures12.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_FEATURES;
        deviceFeatures12.pNext = &deviceFeatures11;
        VkPhysicalDeviceVulkan13Features deviceFeatures13{};
        deviceFeatures13.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES;
        deviceFeatures13.pNext = &deviceFeatures12;
    	VkPhysicalDeviceVulkan14Features deviceFeatures14{};
        deviceFeatures14.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_4_FEATURES;
        deviceFeatures14.pNext = &deviceFeatures13;

        VkPhysicalDeviceFeatures2 deviceFeatures{};
        deviceFeatures.sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2;
        deviceFeatures.pNext = &deviceFeatures14;
        vkGetPhysicalDeviceFeatures2(mPhysicalDevice, &deviceFeatures);
        
        VkDeviceCreateInfo deviceCreateInfo{
	        VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
            &deviceFeatures,
            ...
```

이 방법이 효율적이라고 생각하진 않지만, 어쨋든 api에 익숙해지고 다음 단계로 넘어가기 위해서 이런 방식을 선택했습니다.
정말 사용하는 feature들만 직접 활성화시킬 수 있을 것입니다.
