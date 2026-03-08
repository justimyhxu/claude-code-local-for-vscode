'use strict';

const fs = require('fs');
const path = require('path');

function beautifyFile(inputPath, outputPath) {
    const jsBeautify = require('js-beautify').js;
    const configPath = path.join(__dirname, '..', '.beautifyrc.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    console.log(`Beautifying: ${path.basename(inputPath)}...`);
    const code = fs.readFileSync(inputPath, 'utf8');
    const result = jsBeautify(code, config);

    outputPath = outputPath || inputPath;
    fs.writeFileSync(outputPath, result);

    const lineCount = result.split('\n').length;
    console.log(`  Output: ${path.basename(outputPath)} (${lineCount} lines)`);
    return lineCount;
}

module.exports = { beautifyFile };
