const fs = require('fs');

const f = (key, value, plural) => {
  value = value
  .replace(/\n/g, '\\n')
  .replace(/"/g, '\\"');
  return `"${key}${plural ? '_' + plural.replace('_value', '') : ''}" = "${value}";\n`;
};

let out = '';

['lang', 'langSign'].forEach(part => {
  const path = `../${part}.ts`;

  let str = fs.readFileSync(path).toString().replace(/\s.+\/\/.+/g, '');
  {
    const pattern = '= {';
    str = str.slice(str.indexOf(pattern) + pattern.length - 1);
  }

  {
    const pattern = '};';
    str = str.slice(0, str.indexOf(pattern) + pattern.length - 1);
  }

  //console.log(str);
  const json = JSON.parse(str);
  //console.log(json);

  for(const key in json) {
    const value = json[key];
    if(typeof(value) === 'string') {
      out += f(key, value);
    } else {
      for(const plural in value) {
        out += f(key, value[plural], plural);
      }
    }
  }
});

fs.writeFileSync('./out/langPack.strings', out);