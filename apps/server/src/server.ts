import path from "node:path";
import { createApp } from "./app";
import { REPO } from "./workspace";

const port = Number(process.env.PORT ?? 8788);
const { app } = createApp({ workspaceRoot: path.join(REPO, "workspace") });
// Chỉ lắng nghe trên máy này (127.0.0.1), không mở ra mạng.
const server = app.listen(port, "127.0.0.1", () => console.log(`Lego Studio Engine: server chạy ở http://127.0.0.1:${port}`));
server.on("error", (e: NodeJS.ErrnoException) => {
  console.error(e.code === "EADDRINUSE" ? `Cổng ${port} đang bận. Đóng cửa sổ server Lego Studio cũ rồi chạy lại.` : e.message);
  process.exit(1);
});
const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
