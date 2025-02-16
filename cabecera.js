marked.setOptions({
  gfm: true,
  breaks: true,
  smartypants: true,
  headerIds: false,
  highlight: function(code, lang) {
	if (lang && hljs.getLanguage(lang)) {
	  return hljs.highlight(code, { language: lang }).value;
	}
	return code;
  }
});

window.MathJax = {
  tex: {
	inlineMath: [['$', '$'], ['\\(', '\\)']],
	displayMath: [['$$', '$$'], ['\\[', '\\]']],
	processEscapes: true,
	packages: {'[+]': ['noerrors', 'noundefined']}
  },
  options: {
	skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre'],
	ignoreHtmlClass: 'tex2jax_ignore',
	processHtmlClass: 'tex2jax_process'
  },
  svg: { fontCache: 'global' }
};