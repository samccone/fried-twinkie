goog.module("foo.async_elm");
exports = Polymer({
  is: "async-elm",
  properties: {
    /**
     * @type {Array<!{a: string}>}
     */
    wow: []
  },

  observers: [
    'onWowUpdated(wow)',
  ],

  async onWowUpdated(wow) {
    await new Promise(resolve => resolve(wow));
  },
});
