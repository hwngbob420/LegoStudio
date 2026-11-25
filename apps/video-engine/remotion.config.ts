import { Config } from "@remotion/cli/config";

// Tài nguyên nướng (glb, atlas, HDRI) phục vụ như thư mục public: staticFile("glb/set_X.glb").
Config.setPublicDir("../../workspace/channel_library/baked");
// WebGL cho máy chiếu Three.js khi render không màn hình trên Windows.
Config.setChromiumOpenGlRenderer("angle");
