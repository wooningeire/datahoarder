export const getFormulaBlocks = (content: string) => {
    const formulas: Record<string, string> = {};
    const lines = content.split(/\r?\n/u);
    const formulasStart = findTopLevelKey(lines, "formulas");

    if (formulasStart < 0) {
        return formulas;
    }

    let cursor = formulasStart + 1;

    while (cursor < lines.length) {
        const line = lines[cursor];

        if (line.trim() && getIndent(line) === 0) {
            break;
        }

        const match = line.match(/^\s{2}([^:]+):\s*(.*)$/u);

        if (!match) {
            cursor += 1;
            continue;
        }

        const name = cleanYamlScalar(match[1]);
        const value = match[2].trim();

        if (value === "|-" || value === "|") {
            const block = getIndentedBlock(lines, cursor + 1, getIndent(line));

            formulas[name] = block.text;
            cursor = block.end;
            continue;
        }

        formulas[name] = cleanYamlScalar(value);
        cursor += 1;
    }

    return formulas;
};

const getIndentedBlock = (lines: string[], start: number, parentIndent: number) => {
    let end = start;
    const blockLines: string[] = [];

    while (end < lines.length) {
        const line = lines[end];

        if (line.trim() && getIndent(line) <= parentIndent) {
            break;
        }

        blockLines.push(line);
        end += 1;
    }

    const contentIndent = Math.min(
        ...blockLines.filter((line) => line.trim()).map(getIndent),
    );
    const safeIndent = Number.isFinite(contentIndent) ? contentIndent : parentIndent + 2;

    return {
        end,
        text: blockLines.map((line) => line.slice(Math.min(getIndent(line), safeIndent))).join("\n").trim(),
    };
};

const findTopLevelKey = (lines: string[], key: string) => {
    const normalizedKey = key.toLowerCase();

    return lines.findIndex((line) =>
        getIndent(line) === 0 &&
        line.trim().toLowerCase() === `${normalizedKey}:`
    );
};

const getIndent = (line: string) => {
    return line.match(/^\s*/u)?.[0].replace(/\t/gu, "  ").length ?? 0;
};

const cleanYamlScalar = (value: string) => {
    const trimmedValue = value.trim();
    const quote = trimmedValue[0];

    if ((quote === "\"" || quote === "'") && trimmedValue.at(-1) === quote) {
        return trimmedValue.slice(1, -1);
    }

    return trimmedValue;
};
