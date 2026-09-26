// M2 历史记录导出 CSV
// 将 M1 页面内存中的历史记录数组导出为 dormmate.csv（浏览器下载）
(function () {
  // 数据规范（CLAUDE.md）：表头固定，nodeId 默认 dorm-a
  const HEADERS = ['nodeId', 'temperature', 'humidity', 'status', 'time'];
  const DEFAULT_NODE_ID = 'dorm-a';

  // 字段含逗号/引号/换行时用双引号包裹，内部引号翻倍
  function escapeCSV(value) {
    const str = String(value);
    if (/[,"\n\r]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // UTF-8 BOM 前缀保证 Excel 打开中文不乱码
  function buildCSV(records) {
    const lines = [HEADERS.map(escapeCSV).join(',')];
    for (const rec of records) {
      lines.push(
        [rec.nodeId || DEFAULT_NODE_ID, rec.temp, rec.humidity, rec.status, rec.time]
          .map(escapeCSV)
          .join(',')
      );
    }
    return '﻿' + lines.join('\r\n');
  }

  function exportToCSV(records) {
    const csv = buildCSV(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dormmate.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.exportToCSV = exportToCSV;
})();
