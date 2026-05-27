const fs = require('fs');
const xml = fs.readFileSync('/Users/abhishekchhetri/Developer/chronexa_web/sample-school.xml', 'utf-8');
const match = xml.match(/<group .*?\/>/g);
if (match) {
  let groupsByClass = {};
  match.forEach(g => {
    let m = g.match(/classid="(.*?)"/);
    let cid = m ? m[1] : null;
    let divMatch = g.match(/divisiontag="(.*?)"/);
    let div = divMatch ? divMatch[1] : null;
    let entireMatch = g.match(/entireclass="(.*?)"/);
    let entire = entireMatch ? entireMatch[1] === "1" : false;
    
    if (cid && !entire && div) {
      if (!groupsByClass[cid]) groupsByClass[cid] = {};
      if (!groupsByClass[cid][div]) groupsByClass[cid][div] = 0;
      groupsByClass[cid][div]++;
    }
  });
  
  let maxBits = 0;
  for (let cid in groupsByClass) {
    let bits = 1;
    for (let div in groupsByClass[cid]) {
      bits *= groupsByClass[cid][div];
    }
    if (bits > maxBits) maxBits = bits;
  }
  console.log("Max atomic bits needed per class:", maxBits);
} else {
  console.log("No groups found");
}
