const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/overlay") return new Response("overlay");
    if (url.pathname === "/control") return new Response("control")

    return new Response("not found", { status: 404 });
  },
});

console.log(`health:  http://localhost:${port}/health`);
console.log(`overlay: http://localhost:${port}/overlay`);
console.log(`control: http://localhost:${port}/control`);
