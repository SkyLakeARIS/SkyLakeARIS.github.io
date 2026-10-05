---
title: "기존 문서 이주 1) 설계기록   렌더큐를 위한CB material 셰이더"
description: ""
date: "2026-10-01T21:30:42+09:00"
draft: false
tags: []
---
<mark class="hl-yellow">D3D11 API 기준으로 작업할 때 기존 노션에서 기록했던 기록 문서를 그대로 이주했습니다. 
이전 문서이기 때문에 내용이 정제되어 있지 않습니다. </mark>


### 고민

1. 혹은, Update를 shadermanager하도록 하고, 머테리얼을 매니저에 전달하면, 매니저가 내부에서 ecbtype을 보고 머테리얼에서 데이터를 뽑아서 update, bind는 여전히 renderer가. (매니저는 renderer 어그리게이션)
2. 머티리얼이 생성될 때 셰이더 매니저에게 머티리얼에 대한 슬롯이 뭔지 요청받아서 eCbType을 얻어옴.
    1. 그럼 이에 대해(슬롯 요청은) 필요한 정보는 뭘까?
        
        1. 추후에는 이렇게
        
        - 머티리얼 식별자 - 셰이더 - 머티리얼 슬롯에 대한 내용  
            eCbType에 대한 내용을 생각하다가 머티리얼 슬롯에 대한 내용으로 의식의 흐름을 정리
            1. 머티리얼 식별자 - 셰이더 - 머티리얼 슬롯
                1. 아직 머티리얼 식별자는 존재하지 않음. MaterialManager가 생겨야 하고, 머티리얼들도 체계화되어야 함.
            2. 나중에 파일로 머티리얼에 대한 xml 파일을 만든다고 하면, 외부 fbx를 로드하는 부분에 있어서는 어떻게 해야할지?
                1. 외부 fbx를 감싸는 에셋 파일을 만들어야 함.
                2. 모델 에셋 파일은 fbx 파일 + 자체 정의 머티리얼 xml 파일, 텍스처 파일로 구성
            3. 자체 에셋파일을 만들거라고 하면, 설계도 그런 방향으로 가게끔 설정해야 하니.  
                (머티리얼 식별자 - 셰이더) - (머티리얼 슬롯) 쌍으로 구성해야 함.
            4. 따라서 (머티리얼 식별자 + 셰이더) - (머티리얼 슬롯) 테이블을 수동으로 구성해야 함.
            5. 그럼, 머티리얼이 생성될 때 셰이더 정보는 어떻게 받아올까?
                1. 2-a-ii 와 같은 문제가 동일하게 있으나, 2-a-iiii에서 결정한 것처럼 머티리얼 식별자 - 셰이더 쌍을 가지는 테이블을 수동으로 구성해둬야 함.
        
        1. 머티리얼 식별자 - 셰이더 - eCbType(머티리얼이 쓰는 CB)
            1. 우선은 머티리얼 식별자는 존재하지 않으므로  
                (머티리얼 식별자 - 셰이더) - (eCbType)로 묶임.
            2. PS인지 Vs인지도 알면 좋음.
            3. 근데 생각해보면 Material같이 물체 색상 계산하는데는 거의 PS인 것 같기도.
    2. 머티리얼이 셰이더를 가진다고 하면 여러 패스에 대해서 머티리얼이 분리되어야 함.  
        렌더패킷이 이 정보를 가진다고 하면 머티리얼이 재질+셰이더+텍스처+렌더상태 조합이라는 설계가 깨짐.
        1. 따라서 패스에 따른 부분은 어떻게 처리할 것인지 또 고민이 필요.
        2. 패스라고 해서 다를거 없이 렌더큐 기반이므로 렌더 패킷에 의해서 동작을 해야 할 것임.
        3. 그러나, 패스가 다르면 셰이더도 다를테니 같은 메시를 렌더링한다고 해도 같은 머티리얼 하나로 여러 패스를 대응할 수 없음(해당 주제)
        4. 서브 메시가 여러 머티리얼을 가지던지, 머티리얼에서 셰이더 정보를 빼던지.  
            각 패스별로 하드코딩이 되던지(DrawShadow함수에서 렌더패킷을 해당 패스에 맞도록 아예 수동으로 처리)
            1. → 일단 shadow pass는 그냥 렌더패킷대로 돌리고  
                렌더큐 루프에서 정의된 방식대로 써도 된다.
            2. shadow는 P와 WVP만 쓰기 때문.
3. 렌더큐 순회 루프에서 셰이더가 바뀌면 머티리얼이 가지는 cbType을 셰이더 매니저에게 넘겨서 알아서 업데이트 하도록.
4. 머티리얼이 바뀌면 머티리얼이 가지는 cbtype을 셰이더 매니저에게 넘기면 알아서 업데이트.
    1. 3번과 동일 로직을 탐
5. 바인드도 머티리얼이 가지는 cbtype을 기반으로 바인드.

→ 고도화된 시스템이 아닌 이상은 하드코딩을 해야할 수밖에 없어 보인다.(머티리얼 데이터 파일로 만들거나, 셰이더 퍼뮤테이션이니 리플렉션 같은 시스템)

어디서 할 것인지가 그나마 관점.

→ 자체 정의 데이터 파일이 그나마 대안일지도?

### 최종 결정

1. 머티리얼이 생성될 때 머티리얼이 가지는 셰이더 타입을 통해서 셰이더 매니저에게 CB/Tex/Sampler Slot들을 받아온다.
    1. eShaderType은 생성되는 부분에서 하드코딩으로 정해준다.
2. 머티리얼이 필요한 바인드 슬롯 정보들을 전부 가지고 있으므로 렌더패킷에 정보를 넘겨줄 수 있다.(활용할 수 있음.)
3. 머티리얼을 자체 포멧(xml)으로 구조를 고도화할 때에는 기존에 하드코딩한 부분들을 전부 파일에서 읽어오도록 개선할 것.
    1. 이때 머티리얼 이름(아마 파일명)을 통해서 머티리얼 식별자(HashID)를 만들어야 함
    2. 일반적인 머티리얼 설계와 다르게, 인터넷에서 가져오는 fbx 파일을 활용하므로 일반적인 구조를 적절한 방식으로 커스텀해야 함.

- **설계 변경 (07.26)**

아래 페이지와 같이 머티리얼 시스템은 축소한다. 사유도 아래 문서에 적혀있음.

[최종 내용](https://app.notion.com/p/3a953c1e49dc802ba634e483466707e6?pvs=21)

### 참고자료 메모

내 코멘트+ 각 CB Type 별로 내가 업데이트 빈도에 따라서 Usage Flag를 적절하게 지정했는지?

각 머테리얼별로 사용하는 셰이더에 slot을 기록하도록

- 각 머테리얼이 자신의 slot을 가짐 + 공용 slot과 조합하면 각이 좀 나올듯어쩌면 셰이더에 어떤 슬롯들이 존재하는지 기록(아직 이 시스템은 없음)

머테리얼 파일에 어떤 셰이더를 쓰는지와 함께, 그 셰이더에서 머테리얼 slot은 뭔지 기록

-> 상수는 따로 분리하더라도, 그냥 CPU단에서는 구조체로 묶어둘까?(CbResourcePerFrame, PerMesh, PerMaterial)

- 별개로 BlendState는 옵션이 너무 많은데, 아래처럼 몇가지 항목들을 뽑아내서 eType으로 만들어두기  
    다른 State도 참고할 부분이 많이 있는데, 고급효과들에는 대응이 안될 것 같은 것도 존재함.

> → 결국에는 이런 머테리얼이나 셰이더 등등 메타데이터 파일(xml같은)을 구성하거나, 셰이더를 자체 문법으로 구성하여 리플렉션을 통해 정보들을 뽑아내고 셰이더도 컴파일 하는 방식으로 가는 것 같다.

> → 첫 답변 예시 코드를 보면,  
> 나중에 비동기 리소스까지 할 것 + 머테리얼 리소스를 매니저로 관리하면 공유되는 머테리얼들도 쉽게 처리할 수 있어 보인다.(로드되지 않은 리소스들만 로드(주로 텍스처))

> [gamedev.net/forums/topic/645295-should-game-objects-render-themselves-or-should-an-object-manager-render-them](http://gamedev.net/forums/topic/645295-should-game-objects-render-themselves-or-should-an-object-manager-render-them)  
> 전체적인 설계나 렌더큐를 의미하는 내용들만 나옴.  
> 셰이더나 CB 관련은 아님.  
> 그래도 스피로 답변은 두고두고 읽을만 한 느낌  
> 추가링크:[](https://gamedev.net/forums/topic/645442-game-engine-layout/?_gl=1%2A18xz0wb%2A_ga%2AODk5NDY5OTEuMTc3ODI0NjUzMA..%2A_ga_KXMRL4QGYS%2AczE3ODQ4MDgyOTMkbzE5JGcxJHQxNzg0ODEzMjExJGo2MCRsMCRoMTQ2OTM1MzIzMQ..&utm_source=copy_link&utm_medium=share&utm_campaign=2026_usershare_forum_topic)[https://gamedev.net/forums/topic/645442-game-engine-layout/?_gl=1*18xz0wb*_ga*ODk5NDY5OTEuMTc3ODI0NjUzMA](https://gamedev.net/forums/topic/645442-game-engine-layout/?_gl=1*18xz0wb*_ga*ODk5NDY5OTEuMTc3ODI0NjUzMA)..__ga_KXMRL4QGYS_czE3ODQ4MDgyOTMkbzE5JGcxJHQxNzg0ODEzMjExJGo2MCRsMCRoMTQ2OTM1MzIzMQ..&utm_source=copy_link&utm_medium=share&utm_campaign=2026_usershare_forum_topic

### 참고자료

- CB 설계를 어떻게 했는지 - 경험자 조언상수 버퍼와 셰이더*

> GameDev.net렌더러와 머테리얼 두 개로 구분 머티리얼은 본질적으로 상수 버퍼/텍스처와 GPU 상태 설정의 집합으로, 아티스트가 작성하고 디스크에 데이터로 저장합니다).

2. reserved slot + user slot 으로 나누어도 괜찮다는 의견. (0-n개는 렌더러가 사용하고 나머지는 머테리얼 슬롯)

너무 하나를 재사용해도 좋지 않음(드라이버단의 비동기)

- [DX11] 재료별 또는 셰이더별 고정 버퍼

> [GameDev.net](http://GameDev.net) 항상 GPU가 이전 프레임을 작업 중인 것을 고려해야 함. 따라서 CB를 생성할 때 올바른 Usage Flag를 지정하는 게 좋음.

- 대략적인 구조도 설명해줌

재질 및 셰이더 시스템

> [GameDev.net](http://GameDev.net) 카메라 뷰, 투영, 뷰투영 매트릭스와 같은 공통 데이터는 하나의 PerRender 상수에 저장할 수 있고, 메시 데이터(월드, 월드프로젝션 등)는 월드/렌더 매니저가 객체를 그릴 때마다 설정할 수 있는 PerObject 상수 버퍼에 저장할 수 있습니다.  
> 재질은 셰이더 관리자가 로드한 셰이더에 대한 참조도 저장하고, 이미 로드된 경우 재사용하죠.

- Designing efficient Material/Shader system (CB 4개 권장, dirty flag로 리매핑 최소화)

[gamedev.net/forums/topic/628981-designing-efficient-materialshader-system/4965488](http://gamedev.net/forums/topic/628981-designing-efficient-materialshader-system/4965488)

> Q) 머티리얼 시스템은 저수준 셰이더 시스템과 어떻게 통신해야 하나요? 하드코딩된 셰이더 변수 의미론(예: WORLD_MTX, VIEW_POS, DIFFUSE_COLOR)을 통해서?  
> A)나는 셰이더나 머테리얼 시스템은 그런것들을 알 필요가 없으므로 이런 의미론을 통해서 셰이더와 통신하도록 구조를 잡음  
> 이걸로 엔진이 상수를 자동으로 업데이트 함.  
> 사용자 정의 CB는 이름으로 핸들을 받도록 했다.  
> A2)셰이더 상수 값은 머티리얼 인스턴스가 아니라 cbuffer 인스턴스에 속합니다. "material"은 슬롯 #과 조합된 cbuffer에 대한 포인터를 담고 있습니다.
> 
> Q2) 재료 수업을 의사코드로 스케치해 주실 수 있나요?  
> A) [/인용]계속 단순화하고 일반화하다가 결국 학습 시작 시 재료 수업이 하나도 남지 않았어요. 저는 '상태 그룹'(드**로우 콜에 필요한 GPU 상태 모음, 예: cbuffer 바인딩**)과 cbuffers를 가지고 있는데, cbuffers는 단순히 바이트 배열입니다. 가짜 코드로 보면 이렇게 말할 수 있겠네요: cbuffer를 따로 보면 그 내용을 반영할 방법이 없습니다. 또한 어떤 셰이더와 함께 사용할지 알아야 하고, 그 셰이더에서 반사 데이터를 가져와야 합니다.
> 
> ```
> typedef vector<char> CBuffer;
> struct State {}; struct CBufferBinding : State { int slot; CBuffer* data; }
> typedef vector<State*> StateGroup;
> ```

- Robust Shader Systems for a Game Engine (셰이더 변수 시맨틱 태깅)

[gamedev.net/forums/topic/637787-robust-shader-systems-for-a-game-engine…/5025379](http://gamedev.net/forums/topic/637787-robust-shader-systems-for-a-game-engine%E2%80%A6/5025379)

> A)이제 아마도 커스텀 파라미터를 만들고 싶을 거예요.  
> 그래서 세계 내 다른 객체(조명, 반사 표면)에 의존하는 모든 것은 미리 정의된 accessor가 있고, 커스텀 변수 같은 것은 셰이더 내 이름과 실제 리소스 이름이 포함된 메타데이터 객체를 가지고 있습니다. 그래서 메타데이터 객체 목록을 만들어 루프를 통해 엔진에서 정보를 가져올 수 있습니다.

- Should game objects render themselves, or should an object manager render them? (Mesh→Material→Effect 순회 및 렌더 매니저 구조)

[gamedev.net/forums/topic/645295-should-game-objects-render-themselves-or-should-an-object-manager-render-them](http://gamedev.net/forums/topic/645295-should-game-objects-render-themselves-or-should-an-object-manager-render-them)

- Best way to abstract shaders in a small engine? (머티리얼별 정렬 키, AssetManager)

[gamedev.net/forums/topic/678502-best-way-to-abstract-shaders-in-a-small-engine](http://gamedev.net/forums/topic/678502-best-way-to-abstract-shaders-in-a-small-engine)

- How to manage Mesh and Shader Object in your custom engine? (Mesh Manager로 리소스 공유)

[gamedev.net/forums/topic/714926-how-to-manage-mesh-and-shader-object-in-your-custom-engine](http://gamedev.net/forums/topic/714926-how-to-manage-mesh-and-shader-object-in-your-custom-engine)

> 별로 도움 안됨.

- Game engine asset loading system: How to handle shaders? (Store/Proxy/Cache/Loader 패턴)

[gamedev.net/forums/topic/717775-game-engine-asset-loading-system-how-to-handle-shaders](http://gamedev.net/forums/topic/717775-game-engine-asset-loading-system-how-to-handle-shaders)

> Q) 셰이더 코드 관리에 대한 조언  
> A)  
> 제가 본 바로는 셰이더 스테이지별로 별도의 파일이 있는 경우는 흔하지 않습니다. 모든 일반적인 게임 엔진은 셰이더당 하나의 파일을 가지고 있습니다. 여러 셰이더 파일용 버텍스 셰이더를 공유하고 싶다면 #include를 사용할 수 있습니다. 그렇지 않으면 셰이더당 2+ 파일을 만들고 관리해야 해서 매우 피곤해집니다(지오메트리와 테셀레이션도 있다면 더 많을 수도 있습니다). 처음에는 엔진에서 별도의 파일로 시작했는데, 나중에 귀찮아서 병합했어요. 물론 여전히 할 수는 있지만, 사용성 측면에서는 추천하지 않습니다.