/*
 * Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 *
 * This file is part of kafnus
 *
 * kafnus is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * kafnus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with kafnus. If not, see http://www.gnu.org/licenses/.
 */

// c8 (V8 coverage) reports every line of a function that was never called as
// uncovered, including braces, function headers and the continuation lines of
// multi-line statements. Jest (Istanbul) only reports the line where each
// statement starts. SonarQube sums the hits of all the lcov reports line by
// line, so those extra zero-hit lines make lines that are fully covered by the
// unit tests show up as uncovered. This script rewrites an lcov file keeping
// only the lines Istanbul would consider executable, so that both reports
// describe the same set of lines.
//
// Usage: node scripts/lcovStatementLines.js <lcov.info>

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const projectRoot = path.resolve(__dirname, '..');

function walk(node, visit) {
    if (!node || typeof node.type !== 'string') {
        return;
    }

    visit(node);

    for (const key of Object.keys(node)) {
        const child = node[key];

        if (Array.isArray(child)) {
            child.forEach((item) => walk(item, visit));
        } else if (child && typeof child.type === 'string') {
            walk(child, visit);
        }
    }
}

// Lines where an Istanbul statement starts: every statement except function
// declarations (hoisted, not counted by Istanbul), the initializer of each
// variable declarator and the body of arrow functions written as an expression.
function getStatementLines(source) {
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        locations: true,
        allowHashBang: true
    });
    const lines = new Set();

    walk(ast, (node) => {
        // Istanbul counts the initializer of each declarator, not the declaration itself
        const isStatement =
            /(Statement|Declaration)$/.test(node.type) &&
            node.type !== 'BlockStatement' &&
            node.type !== 'VariableDeclaration';
        const isFunctionDeclaration = node.type === 'FunctionDeclaration';
        const isInitializedDeclarator = node.type === 'VariableDeclarator' && node.init;
        const isExpressionBody = node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement';

        if (isStatement && !isFunctionDeclaration) {
            lines.add(node.loc.start.line);
        }
        if (isInitializedDeclarator) {
            lines.add(node.init.loc.start.line);
        }
        if (isExpressionBody) {
            lines.add(node.body.loc.start.line);
        }
    });

    return lines;
}

function filterRecord(record, rootDir) {
    const sourceFile = record.find((line) => line.startsWith('SF:')).slice(3);
    const sourcePath = path.resolve(rootDir, sourceFile);

    if (!fs.existsSync(sourcePath)) {
        return record;
    }

    let statementLines;
    try {
        statementLines = getStatementLines(fs.readFileSync(sourcePath, 'utf8'));
    } catch (error) {
        console.warn(`Could not parse ${sourceFile}, keeping its lcov record as is: ${error.message}`);
        return record;
    }

    const kept = record.filter((line) => {
        if (!line.startsWith('DA:')) {
            return true;
        }
        return statementLines.has(Number(line.slice(3).split(',')[0]));
    });
    const daLines = kept.filter((line) => line.startsWith('DA:'));
    const hitLines = daLines.filter((line) => Number(line.split(',')[1]) > 0);

    return kept.map((line) => {
        if (line.startsWith('LF:')) {
            return `LF:${daLines.length}`;
        }
        if (line.startsWith('LH:')) {
            return `LH:${hitLines.length}`;
        }
        return line;
    });
}

function filterLcov(content, rootDir = projectRoot) {
    const output = [];
    let record = [];

    for (const line of content.split('\n')) {
        if (line === '') {
            continue;
        }
        record.push(line);
        if (line === 'end_of_record') {
            output.push(...filterRecord(record, rootDir));
            record = [];
        }
    }

    return output.join('\n') + '\n';
}

if (require.main === module) {
    const file = process.argv[2];

    if (!file) {
        console.error('Usage: node scripts/lcovStatementLines.js <lcov.info>');
        process.exit(1);
    }

    fs.writeFileSync(file, filterLcov(fs.readFileSync(file, 'utf8')));
}

module.exports = { filterLcov, getStatementLines };
