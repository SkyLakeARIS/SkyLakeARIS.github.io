---
title: "기존 문서 이주 7) 설계기록   object 관리"
description: ""
date: "2026-10-01T21:31:16+09:00"
draft: false
tags: []
---
<mark class="hl-yellow">D3D11 API 기준으로 작업할 때 기존 노션에서 기록했던 기록 문서를 그대로 이주했습니다. 
이전 문서이기 때문에 내용이 정제되어 있지 않습니다. </mark>


### 고민

디퍼드 셰이딩을 하면서 DebugPanel이 늘어났고, 가볍게 손수 하드코딩으로 작성하기에는 슬슬 번거로워지고 있음.

object들을 쉽게 순회하면서 command를 생성하도록 하고, 관리할 수 있도록 작업이 필요.

특히 DebugPanel은 생성/추가/제거도 간단하게 할 수 있게 하면 좋을 것 같다.

- **초기 구상**

우선은 간단하게 모든 Renderable한 Scene객체들을 전부 Object로 추상화하고, 나중에 종류가 다양해지면 카테고리에 따라 분리해 본다.

ResourceManager는 Model 개체를 반환하지 않고 Mesh만 반환하도록 변경.

ObjectManager는 모델을 추가할 때 ResourceManager에 Load를 요청하고 Mesh를 받아오도록 함

이 작업 진행 시 기존에 renderable 객체들이 제거될 때 그냥 제거되도록 했던 문제를 해결해야 한다.

→ ObjectManager가 객체가 가지는 Mesh Hash를 얻어와서 BufferManager에게 제거하도록 하고, Texture와 같은 리소스들도 마찬가지로 제거시킨다.

DebugPanel은 objectManager가 생성/관리하도록 한다.

Panel은 화면 좌상단을 기준으로 추가되도록 규칙을 정하고, App 단에서는 추가만 하면 내부적으로 offet을 계산하여 렌더링 될 수 있도록 한다.

### 최종 내용

### 참고 문서