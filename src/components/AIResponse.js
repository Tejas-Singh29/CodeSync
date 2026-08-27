import React from 'react';

function inlineContent(text, keyPrefix) {
    return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={`${keyPrefix}-code-${index}`}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={`${keyPrefix}-strong-${index}`}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;
    });
}

function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const elements = [];
    let index = 0;
    let paragraph = [];
    let list = [];
    let listType = null;

    const flushParagraph = () => {
        if (paragraph.length) {
            const key = `paragraph-${elements.length}`;
            elements.push(<p key={key}>{inlineContent(paragraph.join(' '), key)}</p>);
            paragraph = [];
        }
    };
    const flushList = () => {
        if (list.length) {
            const key = `list-${elements.length}`;
            const List = listType === 'ordered' ? 'ol' : 'ul';
            elements.push(<List key={key}>{list.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inlineContent(item, `${key}-${itemIndex}`)}</li>)}</List>);
            list = [];
            listType = null;
        }
    };

    while (index < lines.length) {
        const line = lines[index];
        if (line.trim().startsWith('```')) {
            flushParagraph();
            flushList();
            const codeLines = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                codeLines.push(lines[index]);
                index += 1;
            }
            elements.push(<pre className="aiCodeBlock" key={`code-${elements.length}`}><code>{codeLines.join('\n')}</code></pre>);
            index += 1;
            continue;
        }
        const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            flushList();
            elements.push(<h3 key={`heading-${elements.length}`}>{inlineContent(heading[2], `heading-${elements.length}`)}</h3>);
            index += 1;
            continue;
        }
        const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unordered || ordered) {
            flushParagraph();
            const nextType = ordered ? 'ordered' : 'unordered';
            if (listType && listType !== nextType) flushList();
            listType = nextType;
            list.push((unordered || ordered)[1]);
            index += 1;
            continue;
        }
        if (!line.trim()) {
            flushParagraph();
            flushList();
        } else {
            paragraph.push(line.trim());
        }
        index += 1;
    }
    flushParagraph();
    flushList();
    return elements;
}

const AIResponse = ({ children }) => <div className="aiMarkdown">{renderMarkdown(children)}</div>;

export default AIResponse;
