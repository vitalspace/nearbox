/**
 * Tiny Markdown renderer for the `/agents` page.
 *
 * The document is trusted content from this repo, but it is still escaped
 * before any tag is emitted. Only the constructs used by `AGENTS.md` are
 * supported on purpose: headings, paragraphs, tables, lists, blockquotes,
 * fenced code, rules and inline code/bold/italic/links.
 *
 * No dependency: the page must keep working offline and in the static build.
 */

const escapeHtml = (value: string): string =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Renders inline Markdown after the text has been HTML-escaped. */
function inline(text: string): string {
	const codeSpans: string[] = [];

	let output = escapeHtml(text).replace(/`([^`]+)`/g, (_match, code: string) => {
		codeSpans.push(code);
		return `\u0000${codeSpans.length - 1}\u0000`;
	});

	output = output.replace(
		/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
		(_match, label: string, href: string) =>
			`<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`
	);

	output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	output = output.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
	output = output.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');

	return output.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => {
		return `<code>${codeSpans[Number(index)]}</code>`;
	});
}

function splitRow(line: string): string[] {
	let row = line.trim();

	if (row.startsWith('|')) {
		row = row.slice(1);
	}

	if (row.endsWith('|')) {
		row = row.slice(0, -1);
	}

	return row.split('|').map((cell) => cell.trim());
}

const isTableSeparator = (line: string): boolean =>
	/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');

export function renderMarkdown(source: string): string {
	const lines = source.replace(/\r\n/g, '\n').split('\n');
	const html: string[] = [];
	let index = 0;
	let paragraph: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length === 0) {
			return;
		}

		html.push(`<p>${inline(paragraph.join(' '))}</p>`);
		paragraph = [];
	};

	while (index < lines.length) {
		const line = lines[index];

		// Fenced code block.
		if (/^\s*```/.test(line)) {
			flushParagraph();
			const language = line.trim().replace(/^```/, '').trim();
			const code: string[] = [];
			index += 1;

			while (index < lines.length && !/^\s*```/.test(lines[index])) {
				code.push(lines[index]);
				index += 1;
			}

			index += 1;
			const className = language ? ` class="language-${escapeHtml(language)}"` : '';
			html.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`);
			continue;
		}

		if (line.trim() === '') {
			flushParagraph();
			index += 1;
			continue;
		}

		// Horizontal rule.
		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			flushParagraph();
			html.push('<hr />');
			index += 1;
			continue;
		}

		// Heading.
		const heading = line.match(/^(#{1,6})\s+(.*)$/);
		if (heading) {
			flushParagraph();
			const level = heading[1].length;
			html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
			index += 1;
			continue;
		}

		// Table: header row followed by a separator row.
		if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
			flushParagraph();
			const header = splitRow(line);
			index += 2;
			const rows: string[][] = [];

			while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
				rows.push(splitRow(lines[index]));
				index += 1;
			}

			const head = header.map((cell) => `<th>${inline(cell)}</th>`).join('');
			const body = rows
				.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
				.join('');

			html.push(
				`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
			);
			continue;
		}

		// Blockquote.
		if (/^\s*>\s?/.test(line)) {
			flushParagraph();
			const quote: string[] = [];

			while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
				quote.push(lines[index].replace(/^\s*>\s?/, ''));
				index += 1;
			}

			html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
			continue;
		}

		// Lists.
		if (/^\s*[-*]\s+/.test(line)) {
			flushParagraph();
			const items: string[] = [];

			while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
				items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
				index += 1;
			}

			html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
			continue;
		}

		if (/^\s*\d+\.\s+/.test(line)) {
			flushParagraph();
			const items: string[] = [];

			while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
				items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
				index += 1;
			}

			html.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</ol>`);
			continue;
		}

		paragraph.push(line.trim());
		index += 1;
	}

	flushParagraph();
	return html.join('\n');
}
