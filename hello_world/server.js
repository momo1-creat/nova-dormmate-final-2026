const http = require('node:http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Hello AI Coding</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      background: #f5f5f5;
    }
    h1 {
      font-size: 4rem;
      color: #333;
    }
  </style>
</head>
<body>
  <h1>hello ai coding</h1>
</body>
</html>`);
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
