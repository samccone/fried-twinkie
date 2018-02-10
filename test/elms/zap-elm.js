goog.module("foo.zap_elm");
exports = Polymer({
  is: "zap-elm",
  properties: {
    /**
     * @type {string}
     */
    zap: "ok"
  },
  attached() {
    glob = "4";
  }
});
