const fs = require('fs');
const path = require('path');

const tabSpaces = '    ';

function white(n) {
	return (new Array(n)).fill(' ').join('');
}

function printSource(source, line, column, lastColumn) {

	if (!line) return;

	function _pre(l, c) {
		let s = '        ' + l;
		return s.substring(s.length-8) + ':' + (c + '   ').substring(0,4) + '|';
	}

	// print code with prefix LLLLLLLL:CCCC|
	let padding = white(14); // padding for pre
	let code = source[line-1];

	if (!code) return;

	if (line > 1) {
		if (line > 2) {
			console.log('%s%s', _pre(line-2, 0), source[line-3].replace(/\t/g, tabSpaces));
		}
		console.log('%s%s', _pre(line-1, 0), source[line-2].replace(/\t/g, tabSpaces));
	}

	console.log('%s%s', _pre(line, column), code.replace(/\t/g, tabSpaces));

	// print highlight
	if (column) {
		padding += code.substring(0, column).replace(/\S/g, ' ').replace(/\t/g, tabSpaces);
	}

	let markers = '^';
	if (lastColumn && lastColumn > column) {
		markers = code.substring(column, lastColumn+1).replace(/\S/g, ' ').replace(/\t/, tabSpaces).replace(/ /g, '^');
	}

	console.log('%s%s', padding, markers);
}

const argv = require('minimist')(process.argv.slice(2));

if (argv._.length != 2) {
	console.log('Usage: node smprint [-d <source_roots>] [-s <source_pattern>] [-r <min>:<max>] [-n <names>] <code> <map>');
	console.log('  source_roots    list of directories to search for source files: src,vendor/utils. default to .');
	console.log('  source_pattern  pattern of source filename to match');
	console.log('  min:max         range of the generated code to print');
	console.log('  names            symbol names to match');
	process.exit(0);
}

var matchFile = () => { return true; };
var matchRange = () => { return true; };
var matchName = () => { return true; };


if (argv.n) {
	let pats = argv.n.split(',').map(s => new RegExp(s));
	matchName = (m) => pats.find(p => m.name && m.name.match(p));
}

if (argv.s) {
	let pats = argv.s.split(',').map(s => new RegExp(s));
	matchFile = (m) => pats.find(p => m.source && m.source.match(p));
}

if (argv.r) {
	let start = 1, end = Number.MAX_SAFE_INTEGER;
	const toks = argv.r.split(':');
	if (toks.length === 1) {
		start = parseInt(toks[0]);
	} else if (toks.length === 2) {
		if (toks[0] !== '') {
			start = parseInt(toks[0]);
		}
		if (toks[1] !== '') {
			end = parseInt(toks[1]);
		}
	} else {
		return;
	}
	matchRange = (m) => start <= m.generatedLine && m.generatedLine <= end;
}

function match(m) {
	return matchFile(m) && matchRange(m) && matchName(m);
}

var sourceDirs = [ '.' ];
if (argv.d) {
	sourceDirs = argv.d.split(',');
}

function findSource(m) {
	const WEBPACK_SCHEME = 'webpack:///';

	let source = m.source;
	if (!source) return;

	while (source.startsWith(WEBPACK_SCHEME)) {
		source = source.substring(WEBPACK_SCHEME.length);
	}

	if (source.startsWith('/')) {
		if (fs.existsSync(source));
		return source;
	} else {
		for (let dir of sourceDirs) {
			let p = path.resolve(dir, source);
			if (fs.existsSync(p)) {
				return p;
			}
		}
	}
}

fs.readFile(argv._[0], (err, sourceData) => {
	fs.readFile(argv._[1], (err, mapData) => {
		if (err) {
			throw err;
		}

		const targetLines = sourceData.toString().split('\n');
		let sourceFile, sourceLines;

		require('source-map').SourceMapConsumer.with(mapData.toString(), null, (consumer) => {
			consumer.computeColumnSpans();
			let cnt = 0;
			consumer.eachMapping(m => {
				cnt++;
				if (match(m)) {
					let summary = `[${cnt}] `;
					if (m.name) {
						summary += ` ${m.name} `;
					}
					summary += `${m.generatedLine}:${m.generatedColumn}`;
					if (m.lastGeneratedColumn) {
						summary += '-' + m.lastGeneratedColumn;
					}
					summary += ` => ${m.source} ${m.originalLine}:${m.originalColumn}`;

					console.log('\n', summary);

					printSource(targetLines, m.generatedLine, m.generatedColumn, m.lastGeneratedColumn);

					if (m.source !== sourceFile) {
						sourceFile = null;
						sourceLines = null;
						let p = findSource(m);
						if (p) {
							sourceFile = m.source;
							sourceLines = fs.readFileSync(p).toString().split('\n');
						}
					}

					if (sourceLines) {
						printSource(sourceLines, m.originalLine, m.originalColumn);
					} else {
						console.log('             |  **************** source not found ****************');
					}
				}
			});
		});
	});
});
