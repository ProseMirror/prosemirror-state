// PluginSpec:: interface
//
// A plugin spec provides a definition for a plugin.
//
//   props:: ?EditorProps
//   The [view props](#view.EditorProps) added by this plugin. Props
//   that are functions will be bound to have the plugin instance as
//   their `this` binding.
//
//   state:: ?StateField<any>
//   A [state field](#state.StateField) defined by this plugin.
//
//   key:: ?PluginKey
//   Can optionally be used to make this a keyed plugin. You can
//   have only one plugin with a given key in a given state, but
//   it is possible to access the plugin's configuration and state
//   through the key, without having access to the plugin instance
//   itself.
//
//   view:: ?(EditorView) → Object
//   When the plugin needs to interact with the editor view, or
//   set something up in the DOM, use this field. The function
//   will be called when the plugin's state is associated with an
//   editor view.
//
//     return::-
//     Should return an object with the following optional
//     properties:
//
//       update:: ?(view: EditorView, prevState: EditorState)
//       Called whenever the view's state is updated.
//
//       destroy:: ?()
//       Called when the view is destroyed or receives a state
//       with different plugins.
//
//   filterTransaction:: ?(Transaction, EditorState) → bool
//   When present, this will be called before a transaction is
//   applied by the state, allowing the plugin to cancel it (by
//   returning false).
//
//   appendTransaction:: ?(transactions: [Transaction], oldState: EditorState, newState: EditorState) → ?Transaction
//   Allows the plugin to append another transaction to be applied
//   after the given array of transactions. When another plugin
//   appends a transaction after this was called, it is called
//   again with the new state and extended array of transactions.

function bindProps(obj, self, target) {
  for (let prop in obj) {
    let val = obj[prop]
    if (val instanceof Function) val = val.bind(self)
    else if (prop == "handleDOMEvents") val = bindProps(val, self, {})
    target[prop] = val
  }
  return target
}

// ::- Plugins wrap extra functionality that can be added to an
// editor. They can define new [state fields](#state.StateField), and
// add [view props](#view.EditorProps).
class Plugin {
  // :: (PluginSpec)
  // Create a plugin.
  constructor(spec) {
    // :: EditorProps
    // The props exported by this plugin.
    this.props = {}
    if (spec.props) bindProps(spec.props, this, this.props)
    // :: Object
    // The plugin's configuration object.
    this.spec = spec
    this.key = spec.key ? spec.key.key : createKey("plugin")
  }

  // :: (EditorState) → any
  // Get the state field for this plugin.
  getState(state) { return state[this.key] }
}
exports.Plugin = Plugin

// StateField:: interface<T>
// A plugin may provide a state field (under its `state` property) of
// this type, which describes the state it wants to keep. Functions
// provided here are always called with the plugin instance as their
// `this` binding.
//
//   init:: (config: Object, instance: EditorState) → T
//   Initialize the value of this field. `config` will be the object
//   passed to [`EditorState.create`](#state.EditorState^create). Note
//   that `instance` is a half-initialized state instance, and will
//   not have values for any fields initialized after this one.
//
//   apply:: (tr: Transaction, value: T, oldState: EditorState, newState: EditorState) → T
//   Apply the given transaction to this state field, producing a new
//   field value. Note that the `newState` argument is a partially
//   constructed state does not yet contain the state from plugins
//   coming after this plugin.
//
//   toJSON:: ?(value: T) → *
//   Convert this field to JSON. Optional, can be left off to disable
//   JSON serialization for the field.
//
//   fromJSON:: ?(config: Object, value: *, state: EditorState) → T
//   Deserialize the JSON representation of this field. Note that the
//   `state` argument is again a half-initialized state.

const keys = Object.create(null)

function createKey(name) {
  if (name in keys) return name + "$" + ++keys[name]
  keys[name] = 0
  return name + "$"
}

// ::- A key is used to [tag](#state.PluginSpec.key)
// plugins in a way that makes it possible to find them, given an
// editor state. Assigning a key does mean only one plugin of that
// type can be active in a state.
class PluginKey {
  // :: (?string)
  // Create a plugin key.
  constructor(name = "key") { this.key = createKey(name) }

  // :: (EditorState) → ?Plugin
  // Get the active plugin with this key, if any, from an editor
  // state.
  get(state) { return state.config.pluginsByKey[this.key] }

  // :: (EditorState) → ?any
  // Get the plugin's state from an editor state.
  getState(state) { return state[this.key] }
}
exports.PluginKey = PluginKey
