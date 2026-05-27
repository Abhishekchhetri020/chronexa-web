const fs = require('fs');
const xml = fs.readFileSync('/Users/abhishekchhetri/Developer/chronexa_web/sample-school.xml', 'utf-8');

const groupDiv = {};
const matchGroups = xml.match(/<group .*?\/>/g);
if (matchGroups) {
  matchGroups.forEach(g => {
    let idM = g.match(/id="(.*?)"/);
    let divM = g.match(/divisiontag="(.*?)"/);
    if (idM && divM) groupDiv[idM[1]] = divM[1];
  });
}

let lessonsWithMultiDivs = 0;
const matchLessons = xml.match(/<lesson .*?\/>/g);
if (matchLessons) {
  matchLessons.forEach(l => {
    let gM = l.match(/groupids="(.*?)"/);
    if (gM && gM[1]) {
      let gids = gM[1].split(',');
      let divs = new Set();
      gids.forEach(gid => {
        if (groupDiv[gid]) divs.add(groupDiv[gid]);
      });
      if (divs.size > 1) lessonsWithMultiDivs++;
    }
  });
}
console.log("Lessons with groups from multiple divisions:", lessonsWithMultiDivs);
