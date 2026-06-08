const options = parseArgs(Deno.args);
const port = Number(options.port);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected a TCP port, received ${options.port || "nothing"}.`);
}

Deno.serve({ hostname: options.host, port }, (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/") {
        return html("Root route from Deno preview target");
    }

    if (url.pathname === "/notes") {
        return html("Nested notes route from Deno preview target");
    }

    return new Response("Not found", { status: 404 });
});

function html(heading: string) {
    return new Response(
        [
            "<!doctype html>",
            '<html lang="en">',
            "<head>",
            '<meta charset="utf-8">',
            `<title>${heading}</title>`,
            "</head>",
            "<body>",
            `<main data-preview-target="deno"><h1>${heading}</h1></main>`,
            "</body>",
            "</html>",
        ].join("\n"),
        {
            headers: {
                "content-type": "text/html;charset=utf-8",
            },
        },
    );
}

function parseArgs(args: string[]) {
    const parsed = {
        host: "127.0.0.1",
        port: "",
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--host") {
            parsed.host = args[index + 1] ?? parsed.host;
            index += 1;
            continue;
        }

        if (arg === "--port") {
            parsed.port = args[index + 1] ?? "";
            index += 1;
            continue;
        }

        if (!parsed.port && !arg.startsWith("-")) {
            parsed.port = arg;
        }
    }

    return parsed;
}
