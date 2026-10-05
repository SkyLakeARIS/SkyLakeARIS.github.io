---
title: "vkCmdPipelineBarrier2 oldLayout 01181"
description: ""
date: "2026-10-05T13:41:38+09:00"
draft: false
tags: []
---
<mark class="hl-blue">D3D11 -> Vulkan 포팅을 진행하면서 마주친 검증 레이어 에러에 대한 정보 공유 문서입니다.</mark>

튜토리얼을 따라가는 과정에서 아래와 같은 에러가 발생했습니다.

* **에러 메세지**
```
    > Validation Error: [ VUID-vkCmdPipelineBarrier2-oldLayout-01181 ] | MessageID = 0x792884ea
    > (Warning - This VUID has now been reported 10 times, which is the duplicate_message_limit value, this will be the last time reporting it).
    > vkCmdPipelineBarrier2(): pDependencyInfo->pImageMemoryBarriers[0] defines image layout transition (oldLayout = VK_IMAGE_LAYOUT_GENERAL, newLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR) within a render pass instance, which is not allowed.
    > The Vulkan spec states: If vkCmdPipelineBarrier2 is called within a render pass instance, the oldLayout and newLayout members of any image memory barrier included in this command must be equal (<https://docs.vulkan.org/spec/latest/chapters/synchronization.html#VUID-vkCmdPipelineBarrier2-oldLayout-01181>)
    > Objects: 2
    >     [0] VkCommandBuffer 0x1e012b577c0
    >     [1] VkImage 0x30000000003
    > 
```


특히 ImageLayout이 VK_IMAGE_LAYOUT_GENERAL일 때 이 에러가 됐습니다.
다른 레이아웃일 경우에는 image-09555 - troubleshooting 에러가 되거나 둘 다 뜰 수도 있습니다.

하지만, 정확한 에러 조건을 언급하려는 것은 아니고, 
`vkCmdBeginRendering` 호출 후 `vkCmdEndRendering`를 호출하지 않은 상태에서 imageLayoutTransition을 수행하여 검증 에러가 걸렸습니다.

#### 해결
우선적으로 `vkCmdEndRendering` 호출과 imageLayoutTransition 수행하는 순서가 올바른지 점검하는 것이 좋습니다. (EndRendering 이후, EndCommandBuffer전에 해야 합니다.)

imageLayoutTransition을 수행할 때 레이아웃을 Present 레이아웃으로 바꾸는 이 작업도
엄연히 command이기 때문에 렌더 패스가 끝나고 그리고 EndCommandBuffer 전에 기록해야 합니다.