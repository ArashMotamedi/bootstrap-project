const { prompt } = require("inquirer");
const path = require("path");
const fs = require("fs");
const cp = require("child_process");

const allOptions = [
    "git",
    "express",
    "typescript-is",
    "ts-transformer-keys",
    "ts-transformer-enumerate",
]

async function main() {
    let projectName = process.argv[2];
    while (!projectName?.match(/^[a-z0-9_\-]+$/) && projectName !== ".") {
        projectName = (await prompt({ name: "projectName", message: "Folder name" })).projectName;
    }

    const cwd = path.resolve(projectName);
    if (projectName === ".") {
        if (fs.readdirSync(cwd).length > 0) {
            console.error(`${cwd} is not empty`);
            return;
        }
    } else {
        if (fs.existsSync(cwd)) {
            console.error(`${cwd} already exists`);
            return;
        }
    }

    const options = (await prompt({ name: "options", type: "checkbox", choices: allOptions })).options;

    if (projectName !== ".")
        fs.mkdirSync(cwd);

    const exec = (command) => {
        console.log();
        console.log(command);
        cp.execSync(command, { cwd, stdio: "inherit" });
        console.log();
    };

    const read = (file) => fs.readFileSync(path.join(cwd, file)).toString();
    const write = (file, content) => fs.writeFileSync(path.join(cwd, file), content);
    const append = (file, content) => fs.appendFileSync(path.join(cwd, file), content);

    exec("npm init -y");
    exec("tsc --init");
    const npmPackages = ["@types/node", "npm-run-all", "nodemon"]

    if (options.includes("express")) {
        npmPackages.push("express", "@types/express");
    }

    const ttypescriptRequired = ["typescript-is", "ts-transformer-keys", "ts-transformer-enumerate"]
        .some(o => options.includes(o));

    if (ttypescriptRequired) {
        npmPackages.push("ttypescript");

        [
            "typescript-is",
            "ts-transformer-keys",
            "ts-transformer-enumerate"
        ].forEach(p => {
            if (options.includes(p)) {
                npmPackages.push(p);
            }
        });
    }

    exec(`npm install ${npmPackages.join(" ")}`);

    // index.js
    fs.mkdirSync(path.join(cwd, "src"));

    write("src/index.ts",
        `async function main() {
    console.log("Hello!");
}

main()
    .then(() => 0)
    .catch(e => {
        console.error(e);
        return 1;
    })
    .then(code => process.exit(code));
`);

    // tsconfig settings and plugins
    const tsconfig = read("tsconfig.json");
    const tsclines = tsconfig.split("\n");
    let newLines = tsclines.map(line => {
        if (line.trim().startsWith('"target":')) {
            return '    "target": "es2019",';
        }
        if (line.trim().startsWith('// "outDir":')) {
            return '    "outDir": "./lib",';
        }

        if (line.trim().startsWith('// "rootDir":')) {
            return '    "rootDir": "./src",';
        }

        return line;
    });

    if (ttypescriptRequired) {
        const transformers = [];
        if (options.includes("typescript-is"))
            transformers.push("typescript-is/lib/transform-inline/transformer");
        if (options.includes("ts-transformer-keys"))
            transformers.push("ts-transformer-keys/transformer");
        if (options.includes("ts-transformer-enumerate"))
            transformers.push("ts-transformer-enumerate/transformer");

        const transformerLines =
            transformers.map(t => `      ${JSON.stringify({ transform: t })}`)
                .join(",\n");

        const pluginLines = `    "plugins": [\n${transformerLines}\n    ],\n`
        newLines = [...newLines.slice(0, 2), pluginLines, ...newLines.slice(2)];
    }

    write("tsconfig.json", newLines.join("\n"));

    // package.json scripts
    const package = JSON.parse(read("package.json"));
    const tsbuild = ttypescriptRequired ? "ttsc" : "tsc";
    package.scripts = {
        "build": `${tsbuild}`,
        "build-watch": `${tsbuild} -w`,
        "run": "node lib/index.js",
        "run-watch": "nodemon --watch lib lib/index.js",
        "once": "npm-run-all -s build run",
        "watch": "npm-run-all -p build-watch run-watch",
    }
    write("package.json", JSON.stringify(package, undefined, 2));

    if (options.includes("git")) {
        append(".gitignore", ["node_modules", "lib"].join("\n"));
        exec("git init");
    }

    exec(`npm run once`);

    console.log("");
    if (projectName !== ".")
        console.log(`cd ${projectName}`);

    console.log("code .");
    console.log("npm run watch");
    console.log();
}

main()
    .then(() => 0)
    .catch(e => {
        console.error(e);
        return 1;
    })
    .then(code => process.exit(code));