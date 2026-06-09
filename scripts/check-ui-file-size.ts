const maxLineCount = 499;

const checkedRoots = [
    "src/lib/local-vault",
    "src/lib/note-ui",
    "src/lib/whiteboard",
    "src/routes",
];

const checkedExtensions = [
    ".scss",
    ".svelte",
    ".ts",
];

type OversizedFile = {
    lineCount: number,
    path: string,
};

const oversizedFiles: OversizedFile[] = [];

for (const root of checkedRoots) {
    await collectOversizedFiles(root, oversizedFiles);
}

oversizedFiles.sort((left, right) => right.lineCount - left.lineCount || left.path.localeCompare(right.path));

if (oversizedFiles.length > 0) {
    console.error(`UI files must stay under ${maxLineCount + 1} physical lines.`);

    for (const file of oversizedFiles) {
        console.error(`${file.lineCount}\t${file.path}`);
    }

    Deno.exit(1);
}

console.log(`Checked UI file sizes: all files are under ${maxLineCount + 1} physical lines.`);

async function collectOversizedFiles(
    path: string,
    oversized: OversizedFile[],
): Promise<void> {
    for await (const entry of Deno.readDir(path)) {
        const entryPath = `${path}/${entry.name}`;

        if (entry.isDirectory) {
            await collectOversizedFiles(entryPath, oversized);
            continue;
        }

        if (!entry.isFile || !checkedExtensions.some((extension) => entry.name.endsWith(extension))) {
            continue;
        }

        const lineCount = getLineCount(await Deno.readTextFile(entryPath));

        if (lineCount > maxLineCount) {
            oversized.push({ lineCount, path: entryPath });
        }
    }
}

function getLineCount(content: string): number {
    if (!content) {
        return 0;
    }

    return content.split(/\r\n|\r|\n/u).length;
}
