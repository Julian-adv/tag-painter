<script lang="ts">
  // Svelte 5 호환 일반 Svelte 문법 사용
  import { onMount } from 'svelte'

  interface Props {
    id?: string
    label: string
    value: string
    disabled?: boolean
    currentRandomTagResolutions?: Record<string, string>
    onTagDoubleClick?: (tagName: string) => void
  }

  let {
    id = '',
    label = '',
    value = '',
    disabled = false,
    currentRandomTagResolutions,
    onTagDoubleClick
  }: Props = $props()

  let editor: HTMLDivElement

  // === 패턴 정규식 ===
  // __abc__  → 보라색 단일 태그 (내부에 언더스코어 허용, 쉼표/공백 불허, 뒤에 구분자 필요)
  const entityRe = /__([^_\s,](?:(?!__|,|\s).)*?[^_\s,])__(?=[\s,.]|$)/g
  // {aaa|bbb|ccc} → 초록색 칸분할 태그
  const choiceRe = /\{([^{}]+)\}/g
  // 하나로 합친 스캐너 (순서 중요: 겹침 방지)
  const masterRe = /__([^_\s,](?:(?!__|,|\s).)*?[^_\s,])__(?=[\s,.]|$)|\{([^{}]+)\}/g

  // === API: 내부 텍스트 직렬화 ===
  // 예: "abc __def__ {x|y}"
  export function getText(): string {
    return serializeEditor()
  }

  // === API: 외부 텍스트 로딩 ===
  // 예: readText("xxx, yyy, __aaa__, {b|c|d}")
  export function readText(input: string) {
    clearEditor()
    parseAndInsert(input)
    placeCaretAtEnd()
  }

  onMount(() => {
    console.log('ChipEditor mounted', value)
    readText(value)
    // 초기 내용이 비면 하나의 빈 텍스트 노드라도 있게 함 (경계 처리 용이)
    if (!editorHasContent()) {
      editor.appendChild(document.createTextNode(''))
    }
  })

  // === 유틸: 에디터 비우기 ===
  function clearEditor() {
    editor.innerHTML = ''
  }

  function editorHasContent() {
    return editor && editor.childNodes.length > 0
  }

  // === 유틸: HTML 이스케이프 불필요 (텍스트 노드로만 삽입) ===

  // === 태그 DOM 생성 ===
  function createEntityTag(name: string): HTMLSpanElement {
    const span = document.createElement('span')
    span.className = 'tag tag-purple'
    span.contentEditable = 'false'
    span.dataset.type = 'entity'
    span.dataset.value = name

    // Create chip-name (editable display name)
    const chipName = document.createElement('span')
    chipName.className = 'chip-name'
    chipName.contentEditable = 'true'
    chipName.textContent = name
    chipName.dataset.originalName = name

    // Create chip-body (contains hidden name + resolution)
    const chipBody = document.createElement('span')
    chipBody.className = 'chip-body'

    // Hidden name for layout
    const chipNameHidden = document.createElement('span')
    chipNameHidden.className = 'chip-name-hidden'
    chipNameHidden.setAttribute('aria-hidden', 'true')
    chipNameHidden.textContent = name
    chipBody.appendChild(chipNameHidden)

    // Resolution text (if available)
    const resolution = currentRandomTagResolutions?.[name]
    if (resolution) {
      const chipResolution = document.createElement('span')
      chipResolution.className = 'chip-resolution'
      chipResolution.textContent = resolution
      chipBody.appendChild(chipResolution)
    }

    span.appendChild(chipName)
    span.appendChild(chipBody)

    return span
  }

  function createChoiceTag(raw: string): HTMLSpanElement {
    const parts = raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
    const outer = document.createElement('span')
    outer.className = 'tag tag-green'
    outer.contentEditable = 'false'
    outer.dataset.type = 'choice'
    outer.dataset.values = parts.join('|')

    // 칸 분할 렌더링
    const box = document.createElement('span')
    box.className = 'choice-box'
    for (let i = 0; i < parts.length; i++) {
      const cell = document.createElement('span')
      cell.className = 'choice-cell'
      cell.textContent = parts[i]
      box.appendChild(cell)
    }
    outer.appendChild(box)
    return outer
  }

  // === 파싱 & 삽입: 순수 텍스트 → (텍스트/태그) 혼합 노드 ===
  function parseAndInsert(text: string, range?: Range) {
    const frag = document.createDocumentFragment()
    let lastIdx = 0
    for (const m of text.matchAll(masterRe)) {
      const idx = m.index ?? 0
      if (idx > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)))
      }
      if (m[1] !== undefined) {
        // __name__
        frag.appendChild(createEntityTag(m[1].trim()))
      } else if (m[2] !== undefined) {
        // {a|b|c}
        frag.appendChild(createChoiceTag(m[2].trim()))
      }
      lastIdx = idx + m[0].length
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)))
    }

    if (range) {
      range.deleteContents()
      range.insertNode(frag)
    } else {
      editor.appendChild(frag)
    }

    // 태그 사이를 위해 뒤에 빈 텍스트 노드 보장 (경계 삭제/입력 편의)
    ensureTrailingTextNode()
  }

  function ensureTrailingTextNode() {
    const last = editor.lastChild
    if (!(last && last.nodeType === Node.TEXT_NODE)) {
      editor.appendChild(document.createTextNode(''))
    }
  }

  // === 직렬화: DOM → 패턴 포함 원본 문자열 ===
  function serializeEditor(): string {
    let out = ''
    editor.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += (node as Text).data
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.matches('.tag')) {
          const type = el.dataset.type
          if (type === 'entity') {
            const val = el.dataset.value ?? ''
            out += `__${val}__`
          } else if (type === 'choice') {
            const vals = el.dataset.values ?? ''
            out += `{${vals}}`
          }
        }
      }
    })
    return out
  }

  // === 커서/선택 ===
  function getCurrentRange(): Range | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    return sel.getRangeAt(0)
  }

  function placeCaretAtEnd() {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    const last = editor.lastChild
    if (!last) return
    if (last.nodeType === Node.TEXT_NODE) {
      range.setStart(last, (last as Text).data.length)
    } else {
      const txt = document.createTextNode('')
      editor.appendChild(txt)
      range.setStart(txt, 0)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // 텍스트 인덱스 ↔ 노드 위치 매핑 (간단 버전)
  function getPlainTextBeforeCaret(): string {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return ''
    const r = sel.getRangeAt(0).cloneRange()
    r.selectNodeContents(editor)
    r.setEnd(sel.anchorNode!, sel.anchorOffset)
    // 태그는 패턴 문자열로 치환한 텍스트를 사용
    return serializeSlice(r)
  }

  function serializeSlice(range: Range): string {
    // range 안의 내용을 직렬화 (태그 → 패턴)
    const div = document.createElement('div')
    div.appendChild(range.cloneContents())
    // div의 childNodes를 순회해 직렬화 로직 재사용
    let out = ''
    div.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += (node as Text).data
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.matches('.tag')) {
          const type = el.dataset.type
          if (type === 'entity') {
            const val = el.dataset.value ?? ''
            out += `__${val}__`
          } else if (type === 'choice') {
            const vals = el.dataset.values ?? ''
            out += `{${vals}}`
          }
        } else {
          out += el.textContent ?? ''
        }
      }
    })
    return out
  }

  function restoreCaretByPlainPrefix(prefix: string) {
    const target = prefix.length
    let acc = 0

    // 에디터의 "직계" 자식만 순회 (텍스트 노드, .tag 엘리먼트)
    const children = Array.from(editor.childNodes)

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node as Text).data
        if (acc + text.length >= target) {
          setCaret(node as Text, target - acc)
          editor.focus() // 포커스 보장
          return
        }
        acc += text.length
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.classList.contains('tag')) {
          // 태그는 직렬화 문자열 기준으로 길이를 계산
          let rep = ''
          if (el.dataset.type === 'entity') rep = `__${el.dataset.value ?? ''}__`
          else if (el.dataset.type === 'choice') rep = `{${el.dataset.values ?? ''}}`

          if (acc + rep.length >= target) {
            // 태그 내부에는 커서를 놓지 않고, 태그 "뒤"의 텍스트 노드로
            const next = el.nextSibling ?? insertEmptyTextAfter(el)
            // next가 텍스트가 아닐 수도 있으니 보정
            let anchor = next
            if (!anchor || anchor.nodeType !== Node.TEXT_NODE) {
              anchor = document.createTextNode('')
              if (el.nextSibling) editor.insertBefore(anchor, el.nextSibling)
              else editor.appendChild(anchor)
            }
            setCaret(anchor as Text, 0)
            editor.focus()
            return
          }
          acc += rep.length
        }
      }
    }

    // 못 찾으면 맨 뒤
    placeCaretAtEnd()
    editor.focus()
  }

  function insertEmptyTextAfter(el: Node) {
    const txt = document.createTextNode('')
    if (el.nextSibling) el.parentNode!.insertBefore(txt, el.nextSibling)
    else el.parentNode!.appendChild(txt)
    return txt
  }

  function setCaret(textNode: Text, offset: number) {
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    range.setStart(textNode, Math.max(0, Math.min(offset, textNode.data.length)))
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function reparseAllPreserveCaret() {
    const before = getPlainTextBeforeCaret() // 커서 앞 직렬화 텍스트
    const all = serializeEditor()

    clearEditor()
    parseAndInsert(all)

    restoreCaretByPlainPrefix(before)
    editor.focus() // ← 추가
  }

  // === 경계 삭제 처리 ===
  function handleBoundaryDelete(ev: KeyboardEvent) {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const { anchorNode, anchorOffset } = sel

    // caret이 텍스트 노드에 있는 상황에 한해 처리
    if (!anchorNode) return

    // Backspace: 커서 앞이 태그면 제거
    if (ev.key === 'Backspace') {
      // 텍스트 노드의 시작 지점(0)에서, 앞 형제가 태그면 삭제
      const container = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode : anchorNode.parentNode
      if (!container) return

      // caret이 텍스트 노드의 시작
      if (anchorNode.nodeType === Node.TEXT_NODE && anchorOffset === 0) {
        const prev = (container as Node).previousSibling
        if (prev && (prev as HTMLElement).classList?.contains('tag')) {
          ev.preventDefault()
          prev.remove()
          ensureTrailingTextNode()
          return
        }
      }
    }

    // Delete: 커서 뒤가 태그면 제거
    if (ev.key === 'Delete') {
      const container = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode : anchorNode.parentNode
      if (!container) return

      if (anchorNode.nodeType === Node.TEXT_NODE) {
        const text = (anchorNode as Text).data
        if (anchorOffset === text.length) {
          const next = (container as Node).nextSibling
          if (next && (next as HTMLElement).classList?.contains('tag')) {
            ev.preventDefault()
            next.remove()
            ensureTrailingTextNode()
            return
          }
        }
      }
    }
  }

  // === 더블클릭 태그 콜백 ===
  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    const tag = target.closest('.tag') as HTMLElement | null
    if (!tag) return
    const type = tag.dataset.type
    if (type === 'entity') {
      onTagDoubleClick?.(tag.dataset.value ?? '')
    } else if (type === 'choice') {
      onTagDoubleClick?.(tag.dataset.values ?? '')
    }
  }

  // === 붙여넣기: 무조건 플레인 텍스트, 즉시 파싱 ===
  function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    const range = getCurrentRange()
    if (!range) return
    parseAndInsert(text, range)
    // 붙여넣기 후 전체 재파싱(안전) + caret 복원
    reparseAllPreserveCaret()
  }

  // === 입력 이벤트: 즉시 재파싱 (간단/안정 위주) ===
  function onInput() {
    // composition 중에는 건드리지 않음
    if (isComposing) return
    reparseAllPreserveCaret()
  }

  let isComposing = false
  function onCompStart() {
    isComposing = true
  }
  function onCompEnd() {
    isComposing = false
    reparseAllPreserveCaret()
  }
</script>

<div class={disabled ? 'pointer-events-none opacity-50' : ''}>
  <div class="mb-1 flex items-center justify-between">
    <label
      for={id}
      class="text-xs font-medium {disabled ? 'text-gray-400' : 'text-gray-700'} text-left"
      >{label}</label
    >
  </div>
  <div
    class="editor"
    bind:this={editor}
    contenteditable="true"
    spellcheck="false"
    role="textbox"
    tabindex="0"
    onpaste={onPaste}
    oninput={onInput}
    onkeydown={handleBoundaryDelete}
    ondblclick={onDblClick}
    oncompositionstart={onCompStart}
    oncompositionend={onCompEnd}
    aria-label="Tag-enabled text editor"
  ></div>
</div>

<style>
  .editor {
    min-height: 3rem;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background-color: #f9fafb;
    cursor: text;
    text-align: left;
    font-size: 0.875rem;
    white-space: pre-wrap;
    word-break: break-word;
    outline: none;
    line-height: 1.5;
  }
  .editor:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
    background-color: #ffffff;
  }

  :global(.tag) {
    display: inline-flex;
    align-items: stretch;
    border-radius: 0.375rem;
    border: 1px dashed;
    padding: 0 0.35rem 0rem 0.25rem;
    margin: 0.0625rem 0.125rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    vertical-align: baseline;
    user-select: none;
    position: relative;
  }

  :global(.tag-purple) {
    background: #ede9fe; /* 연보라 배경 */
    color: #5b21b6; /* 보라 텍스트 */
    border-color: #c084fc;
  }

  :global(.chip-name) {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0 0.25rem 0.0625rem 0.25rem;
    font-weight: 600;
    font-size: 0.875rem;
    border-radius: 0.375rem 0 0 0.375rem;
    cursor: text;
    background-color: #e9d5ff;
    outline: none;
  }

  :global(.chip-name:focus) {
    outline: 2px solid rgba(56, 189, 248, 0.5);
    outline-offset: 1px;
  }

  :global(.chip-body) {
    display: inline-block;
    max-width: 100%;
    min-width: 0;
    padding: 0.0625rem 0 0 0;
  }

  :global(.chip-name-hidden) {
    visibility: hidden;
    display: inline-block;
    padding-right: 0.4rem;
    font-weight: 600;
    font-size: 0.875rem;
  }

  :global(.chip-resolution) {
    display: inline;
    font-weight: 400;
    opacity: 0.8;
    font-style: italic;
    vertical-align: top;
    min-width: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  :global(.tag-green) {
    background: #eaffea;
    color: #166534;
    padding: 2px; /* choice-box가 내부 여백 관리 */
  }

  /* choice 칸 분할 */
  :global(.choice-box) {
    display: inline-flex;
    gap: 0;
    overflow: hidden;
    border-radius: 9999px;
  }
  :global(.choice-cell) {
    padding: 2px 8px;
    border-left: 1px dashed rgba(0, 0, 0, 0.15);
  }
  :global(.choice-cell):first-child {
    border-left: none;
  }

  /* 태그가 포커스 가능하지 않게 */
  :global(.tag):focus {
    outline: none;
  }
</style>
