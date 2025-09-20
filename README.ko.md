# 태그 페인터

[English](README.md) | 한국어

Tag Painter는 ComfyUI와 연동되는 SvelteKit 기반 웹 애플리케이션입니다. 영역별 프롬프트 구성을 통해 다양한 캐릭터 이미지를 생성할 수 있습니다.

![Tag Painter 스크린샷](docs/images/app-screenshot-ko.png)

## 설치

### 1. 릴리스 다운로드

- [GitHub Releases](https://github.com/Julian-adv/tag-painter/releases)에서 최신 `tag-painter-release-*.zip` 파일을 받습니다.
- 원하는 위치에 압축을 풉니다.

### 2. 애플리케이션 실행

- Windows: `start.bat`
- macOS/Linux: `bash start.sh`

스크립트를 실행하면 애플리케이션이 자동으로 시작되어 브라우저에서 사용할 수 있습니다.
처음 실행은 환경 준비(ComfyUI 설치/가상환경 구성/모델 다운로드 등)로 인해 시간이 꽤 걸릴 수 있습니다. 자동으로 열리지 않으면 브라우저에서 `http://127.0.0.1:3000/` 을 여세요.

설치가 완료되면 아래와 같은 "체크포인트 없음" 안내 대화상자가 나타날 수 있습니다. 이 경우 Civitai나 Hugging Face에서 체크포인트(베이스 모델) 파일을 내려받아 `ComfyUI/models/checkpoints/` 폴더에 넣어주세요. 파일을 넣은 뒤에는 새로 고침(🔄) 버튼을 눌러 모델 목록을 갱신하면 됩니다.

<img src="docs/images/no-checkpoints-ko.png" alt="체크포인트 없음 대화상자" width="335" />

<img src="docs/images/checkpoints-refresh-ko.png" alt="체크포인트 목록 새로고침" width="273" />

- Zeniji_Mix K-illust — https://civitai.com/models/1651774?modelVersionId=1869616
  _위 스크린샷은 이 모델로 생성되었습니다._

### 설정 열기

상단 도구 모음의 톱니(설정) 버튼을 누르면 설정 창이 열립니다. 여기에서 다음 항목을 변경할 수 있습니다.
- 언어: 한국어/영어 전환
- 이미지 생성 폴더: 출력 디렉터리 경로
- 이미지 생성 파라미터: 샘플러, 스텝 수, CFG 스케일, 시드 등
- 기본 퀄리티 프롬프트: 품질 관련 프리픽스 텍스트
- LoRA 목록: 사용할 LoRA 모델 선택/관리

![설정 창](docs/images/settings-ko.png)

### 구도와 존 프롬프트

구도(Composition)를 선택해 화면을 여러 존으로 분할할 수 있습니다(예: 수평 2분할, 수직 2분할 등). 각 존에 개별 프롬프트를 입력하면 해당 영역에만 적용됩니다.

<img src="docs/images/zones-ko.png" alt="구도와 존 프롬프트" width="273" />

- 전체(ALL) 프롬프트: 모든 구역에 공통으로 적용됩니다.
- 1구역/2구역 프롬프트: 각 구역에만 적용되는 태그를 입력합니다.
- 인페인팅 프롬프트: 인페인팅 기능을 사용할 때 적용됩니다.

구도와 존 프롬프트를 함께 사용하면, 인물/배경/의상 등 서로 다른 요소를 영역별로 정교하게 제어할 수 있습니다.

### 태그와 와일드카드 편집

‘생성’ 버튼을 누르면 현재 조합에 따라 실제로 사용될 태그들이 화면에 표시되어, 어떤 태그가 적용되는지 한눈에 확인할 수 있습니다.

태그 영역에서 태그를 더블 클릭하면 와일드카드 편집 대화상자가 열립니다. 태그 구성과 무작위(와일드카드) 설정을 직관적으로 편집할 수 있습니다.

<img src="docs/images/tags-ko.png" alt="태그 영역" width="265" />

<img src="docs/images/wildcards-editor-ko.png" alt="와일드카드 편집기" width="600" />

사용법

| 항목 | 설명 |
| --- | --- |
| 노드 더블 클릭 (Enter) | 노드 이름/내용을 바로 편집합니다. |
| Ctrl+Enter | 선택 노드의 형제 노드를 추가합니다. |
| 드래그 앤 드롭 | 노드의 순서나 위치를 변경합니다. |
| 랜덤 | 이미지를 생성할 때마다 후보 중 하나를 무작위로 새로 선택합니다. |
| 일관 랜덤 | 전체(ALL), 1구역, 2구역에도 같은 값이 일관되게 선택됩니다. 인물의 포즈처럼 모든 존에 일관되게 적용되어야 하는 태그에 사용합니다. |
| 구성 | 이 노드를 사용하면 이미지 생성의 구도를 결정합니다. (하나의 구역, 좌우 분할, 상하 분할이 정해집니다.) |
| 가중치 | 후보 선택 확률을 조절합니다(값이 높을수록 해당 노드가 후보들 중에서 선택될 확률이 높아집니다). |
| 비활성 | 이름이나 패턴을 추가해 특정 노드(또는 특정 패턴)를 생성에서 제외할 수 있습니다. |
| 고정 | 이미지 생성 시 해당 노드를 반드시 선택되도록 고정합니다. 테스트 목적에 좋습니다. |
| 다중 선택/그룹화 (Shift+클릭) | 범위를 선택하고 ‘그룹’ 버튼으로 선택한 노드들을 자식으로 하는 부모 노드를 추가합니다. |
| 추가/삭제 | 상단/우클릭 메뉴로 자식 추가, 최상위 추가, 삭제를 할 수 있습니다. |
| 확장/접기 | 트리의 모든 노드를 확장/접기하여 구조를 빠르게 확인합니다. |

### 자동 설치/설정 항목

- start.bat를 실행하면 ComfyUI와 Python 가상환경이 자동으로 준비됩니다.
- 다음 커스텀 노드가 자동으로 설치됩니다.
  - cgem156-ComfyUI — https://github.com/laksjdjf/cgem156-ComfyUI
  - ComfyUI-Custom-Scripts — https://github.com/pythongosssss/ComfyUI-Custom-Scripts
  - ComfyUI-Impact-Pack — https://github.com/ltdrdata/ComfyUI-Impact-Pack
  - ComfyUI-Impact-Subpack — https://github.com/ltdrdata/ComfyUI-Impact-Subpack
- 커스텀 노드 동작에 필요한 보조 모델도 자동 다운로드됩니다.
  - YOLO (사람/얼굴):
    - person_yolov8m-seg.pt — https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8m-seg.pt
    - face_yolov8m.pt — https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt
  - SAM: sam_vit_b_01ec64.pth — https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/sams/sam_vit_b_01ec64.pth
  - VAE: fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors — https://huggingface.co/moonshotmillion/VAEfixFP16ErrorsSDXLLowerMemoryUse_v10/resolve/main/fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors
- 예시 LoRA 모델이 자동으로 다운로드되어 `ComfyUI/models/loras/`에 설치됩니다.
  - MoriiMee_Gothic_Niji_Style_Illustrious_r1 — https://huggingface.co/NeigeSnowflake/neigeworkflow/resolve/main/MoriiMee_Gothic_Niji_Style_Illustrious_r1.safetensors
  - spo_sdxl_10ep_4k-data_lora_webui — https://civitai.com/api/download/models/567119
  - Sinozick_Style_XL_Pony — https://civitai.com/api/download/models/481798
  - Fant5yP0ny — https://huggingface.co/LyliaEngine/Fant5yP0ny/resolve/main/Fant5yP0ny.safetensors?download=true

### 실행 옵션

- `-NoComfy`: 사용자가 이미 설치/실행 중인 ComfyUI를 그대로 사용합니다. ComfyUI 설치/시작을 건너뜁니다.
- `-ComfyOnly`: Tag Painter는 실행하지 않고 ComfyUI만 실행합니다.

## 라이선스

이 프로젝트는 오픈 소스입니다. 자세한 내용은 LICENSE 파일을 참조하세요.
