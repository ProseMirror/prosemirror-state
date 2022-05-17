import {EditorState, Selection, TextSelection, NodeSelection, Command, Transaction} from "prosemirror-state"
import {Node, Schema} from "prosemirror-model"

// Wrapper object to make writing state tests easier.

export function selFor(doc: Node) {
  let a = (doc as any).tag.a
  if (a != null) {
    let $a = doc.resolve(a)
    if ($a.parent.inlineContent)
      return new TextSelection($a, (doc as any).tag.b != null ? doc.resolve((doc as any).tag.b) : undefined)
    else return new NodeSelection($a)
  }
  return Selection.atStart(doc)
}

export class TestState {
  state: EditorState
  constructor(config: {selection?: Selection, doc?: Node, schema?: Schema}) {
    if (!config.selection && config.doc) config.selection = selFor(config.doc)
    this.state = EditorState.create(config)
  }

  apply(tr: Transaction) {
    this.state = this.state.apply(tr)
  }

  command(cmd: Command) {
    cmd(this.state, tr => this.apply(tr))
  }

  type(text: string) {
    this.apply(this.tr.insertText(text))
  }

  deleteSelection() {
    this.apply(this.state.tr.deleteSelection())
  }

  textSel(anchor: number, head?: number) {
    let sel = TextSelection.create(this.state.doc, anchor, head)
    this.state = this.state.apply(this.state.tr.setSelection(sel))
  }

  nodeSel(pos: number) {
    let sel = NodeSelection.create(this.state.doc, pos)
    this.state = this.state.apply(this.state.tr.setSelection(sel))
  }

  get doc() { return this.state.doc }
  get selection() { return this.state.selection }
  get tr() { return this.state.tr }
}
