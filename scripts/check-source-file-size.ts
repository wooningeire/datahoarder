const maxLineCount = 499;

const checkedRoots = [
    "src",
    "scripts",
];

const checkedExtensions = [
    ".js",
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
    console.error(`Production source files must stay under ${maxLineCount + 1} physical lines.`);

    for (const file of oversizedFiles) {
        console.error(`${file.lineCount}\t${file.path}`);
    }

    Deno.exit(1);
}

console.log(`Checked production source file sizes: all files are under ${maxLineCount + 1} physical lines.`);

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

        if (!entry.isFile || !shouldCheckFile(entry.name)) {
            continue;
        }

        const lineCount = getLineCount(await Deno.readTextFile(entryPath));

        if (lineCount > maxLineCount) {
            oversized.push({ lineCount, path: entryPath });
        }
    }
}

function shouldCheckFile(name: string): boolean {
    return (
        checkedExtensions.some((extension) => name.endsWith(extension)) &&
        !name.endsWith(".d.ts") &&
        !name.endsWith(".spec.ts") &&
        !name.endsWith(".test.ts")
    );
}

function getLineCount(content: string): number {
    if (!content) {
        return 0;
    }

    return content.split(/\r\n|\r|\n/u).length;
}
