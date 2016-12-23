// ::- Plugins wrap extra functionality that can be added to an
// editor. They can define new [state fields](#state.StateField), and
// add [view props](#view.EditorProps).
class Plugin {
  // :: (Object)
  // Create a plugin.
  //
  //   options::-
  //
  //     props:: ?EditorProps
  //     The [view props](#view.EditorProps) added by this plugin.
  //     Note that the [`onAction`](#view.EditorProps.onAction) and
  //     [`state`](#view.EditorProps.state) props can't be defined by
  //     plugins, only by the main props object. Props that are
  //     functions will be bound to have the plugin instance as their
  //     `this` binding.
  //
  //     state:: ?StateField
  //     A [state field](#state.StateField) defined by this plugin.
  //
  //     key:: ?PluginKey
  //     Can optionally be used to make this a keyed plugin. You can
  //     have only one plugin with a given key in a given state, but
  //     it is possible to access the plugin's configuration and state
  //     through the key, without having access to the plugin instance
  //     itself.
  //
  //     view:: ?(EditorView) → Object
  //     When the plugin needs to interact with the editor view, or
  //     set something up in the DOM, use this field. The function
  //     will be called when the plugin's state is associated with an
  //     editor view.
  //
  //       return:: Object
  //       Should return an object with the following optional
  //       properties:
  //
  //         update:: ?(EditorView)
  //         Called whenever the view's state is updated.
  //
  //         destroy:: ?()
  //         Called when the view is destroyed or receives a state
  //         with different plugins.
  constructor(options) {
    // :: EditorProps
    // The props exported by this plugin.
    this.props = {}
    if (options.props) for (let prop in options.props) {
      let val = options.props[prop]
      if (val instanceof Function) val = val.bind(this)
      this.props[prop] = val
    }
    // :: Object
    // The plugin's configuration object.
    this.options = options
    this.key = options.key ? options.key.key : createKey("plugin")
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
//   not have values for any fields initialzed after this one.
//
//   applyAction:: (action: Action, value: T, oldState: EditorState, newState: EditorState) → T
//   Apply the given action to this state field, producing a new field
//   value. Note that the `newState` argument is a partially
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

// ::- A key is used to [tag](#state.Plugin.constructor^options.key)
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
