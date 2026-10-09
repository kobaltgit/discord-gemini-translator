(() => {
  function findSlateEditor(slateEditor) {
    if (!slateEditor) return null;

    // 1. Поиск через React Fiber
    const fiberKey = Object.keys(slateEditor).find((k) =>
      k.startsWith("__reactFiber$"),
    );
    if (fiberKey && slateEditor[fiberKey]) {
      let curr = slateEditor[fiberKey];
      while (curr) {
        if (curr.memoizedProps?.editor) {
          return curr.memoizedProps.editor;
        }
        if (curr.stateNode?.editor) {
          return curr.stateNode.editor;
        }
        curr = curr.return;
      }
    }

    // 2. Поиск через React Props
    const propsKey = Object.keys(slateEditor).find((k) =>
      k.startsWith("__reactProps$"),
    );
    if (propsKey && slateEditor[propsKey]) {
      const props = slateEditor[propsKey];
      if (props.editor) return props.editor;
      if (props.children?.props?.editor) return props.children.props.editor;
    }

    return null;
  }

  function setSlateText(editor, newText) {
    if (!editor || !Array.isArray(editor.children)) return false;

    try {
      // 1. Удаляем все дополнительные строки/блоки, если их больше одного
      while (editor.children.length > 1) {
        const idx = editor.children.length - 1;
        editor.apply({
          type: "remove_node",
          path: [idx],
          node: editor.children[idx],
        });
      }

      // 2. Очищаем все текстовые узлы внутри первого блока
      const firstBlock = editor.children[0];
      if (firstBlock && Array.isArray(firstBlock.children)) {
        while (firstBlock.children.length > 1) {
          const idx = firstBlock.children.length - 1;
          editor.apply({
            type: "remove_node",
            path: [0, idx],
            node: firstBlock.children[idx],
          });
        }

        const firstTextNode = firstBlock.children[0];
        const oldText = firstTextNode?.text || "";
        if (oldText.length > 0) {
          editor.apply({
            type: "remove_text",
            path: [0, 0],
            offset: 0,
            text: oldText,
          });
        }
      }

      // 3. Вставляем новый переведенный текст через нативную операцию Slate
      editor.apply({
        type: "insert_text",
        path: [0, 0],
        offset: 0,
        text: newText,
      });

      // 4. Перемещаем каретку в конец перевода
      editor.apply({
        type: "set_selection",
        properties: editor.selection,
        newProperties: {
          anchor: { path: [0, 0], offset: newText.length },
          focus: { path: [0, 0], offset: newText.length },
        },
      });

      // 5. Уведомляем внутреннее состояние Slate
      if (typeof editor.onChange === "function") {
        editor.onChange();
      }

      return true;
    } catch (e) {
      console.warn("[DGT] Ошибка прямого обновления Slate:", e);
      return false;
    }
  }

  function fallbackReplace(slateEditor, newText) {
    slateEditor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(slateEditor);
    selection.removeAllRanges();
    selection.addRange(range);

    document.execCommand("delete", false, null);

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", newText);
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    slateEditor.dispatchEvent(pasteEvent);
    slateEditor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Слушаем команду от изолированного content-скрипта
  window.addEventListener("DGT_REPLACE_TEXT", (e) => {
    const newText = e.detail?.text;
    if (!newText) return;

    const slateEditor = document.querySelector(
      '[role="textbox"][contenteditable="true"]',
    );
    if (!slateEditor) return;

    slateEditor.focus();

    const editor = findSlateEditor(slateEditor);
    let success = false;
    if (editor) {
      success = setSlateText(editor, newText);
    }

    if (!success) {
      fallbackReplace(slateEditor, newText);
    }

    slateEditor.dispatchEvent(new Event("input", { bubbles: true }));
  });
})();
