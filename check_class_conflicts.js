const fs = require('fs');
const xml = fs.readFileSync('/Users/abhishekchhetri/Developer/chronexa_web/sample-school.xml', 'utf-8');

const matchClasses = xml.match(/<class .*?id="(.*?)"/g);
const matchGroups = xml.match(/<group .*?\/>/g);

let cById = {};
if (matchClasses) {
    matchClasses.forEach(c => {
        let m = c.match(/id="(.*?)"/);
        if (m) cById[m[1]] = 1;
    });
}

if (matchGroups) {
  let gCounts = 0;
  matchGroups.forEach(g => {
    let divM = g.match(/divisiontag="(.*?)"/);
    if (divM && divM[1] !== "") gCounts++;
  });
  console.log("Groups with division tags:", gCounts);
}
