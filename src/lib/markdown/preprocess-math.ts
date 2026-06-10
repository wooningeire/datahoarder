export const normalizeDisplayMath = (content: string) => {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/u);
    const normalizedLines: string[] = [];
    let inFence = false;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        const fenceMatch = line.match(/^\s*(```|~~~)/u);

        if (fenceMatch) {
            inFence = !inFence;
            normalizedLines.push(line);
            continue;
        }

        if (inFence) {
            normalizedLines.push(line);
            continue;
        }

        const normalizedLine = normalizeDisplayMathLine(line, lines, {
            value: index,
        });
        index = normalizedLine.lineIndex;
        normalizedLines.push(normalizedLine.line);
    }

    return normalizedLines.join(newline);
};

const normalizeDisplayMathLine = (
    line: string,
    lines: string[],
    lineIndex: { value: number },
) => {
    let currentLine = line;
    let normalizedLine = "";

    while (true) {
        const openIndex = currentLine.indexOf("$$");

        if (openIndex < 0) {
            normalizedLine += currentLine;
            break;
        }

        const closeIndex = currentLine.indexOf("$$", openIndex + 2);

        if (closeIndex >= 0) {
            normalizedLine +=
                currentLine.slice(0, openIndex) +
                toDisplayMath(currentLine.slice(openIndex + 2, closeIndex).trim());
            currentLine = currentLine.slice(closeIndex + 2);
            continue;
        }

        const mathBlock = collectMultilineMath(lines, lineIndex.value, currentLine, openIndex);

        if (!mathBlock) {
            normalizedLine += currentLine;
            break;
        }

        normalizedLine += currentLine.slice(0, openIndex) + toDisplayMath(mathBlock.math);
        currentLine = mathBlock.suffix;
        lineIndex.value = mathBlock.closeLineIndex;
    }

    return {
        line: normalizedLine,
        lineIndex: lineIndex.value,
    };
};

const collectMultilineMath = (
    lines: string[],
    startLineIndex: number,
    currentLine: string,
    openIndex: number,
) => {
    const mathLines = [currentLine.slice(openIndex + 2)];
    let suffix = "";

    for (let closeLineIndex = startLineIndex + 1; closeLineIndex < lines.length; closeLineIndex += 1) {
        const mathLine = lines[closeLineIndex] ?? "";
        const mathCloseIndex = mathLine.indexOf("$$");

        if (mathCloseIndex >= 0) {
            mathLines.push(mathLine.slice(0, mathCloseIndex));
            suffix = mathLine.slice(mathCloseIndex + 2);

            return {
                closeLineIndex,
                math: mathLines.join("\n").trim(),
                suffix,
            };
        }

        mathLines.push(mathLine);
    }

    return null;
};

const toDisplayMath = (math: string) => {
    return `<span class="math-display">${encodeMathText(`\\[\n${math}\n\\]`)}</span>`;
};

const encodeMathText = (text: string) => {
    return Array.from(text)
        .map((character) => `&#${character.codePointAt(0)};`)
        .join("");
};
