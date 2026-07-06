/* Генератор SVG-сцен домов. Используется и в каталоге (index.html),
   и на страницах домов (dom.html). Тип: forest|lake|mountain|winter|pines|water */
window.scene = function scene(type){
  const skies = {
    forest:['#BFD9C6','#7FB08C'], lake:['#CDE4E8','#8FC0C6'],
    mountain:['#D8DCE6','#A7B0C4'], winter:['#E4EAEF','#BFD0DA'],
    pines:['#D6E3C7','#9BBE86'], water:['#C9E0DC','#8AB7B0'],
  };
  const [s1,s2]=skies[type] || skies.forest;
  let mid='', fg='';
  const tree=(x,y,s,c)=>`<path d="M${x} ${y} l${8*s} ${20*s} h${-16*s} Z M${x} ${y+10*s} l${11*s} ${22*s} h${-22*s} Z M${x} ${y+22*s} l${13*s} ${24*s} h${-26*s} Z" fill="${c}"/><rect x="${x-2*s}" y="${y+44*s}" width="${4*s}" height="${8*s}" fill="#5a3d24"/>`;

  if(type==='mountain'){
    mid=`<path d="M0 200 L120 90 210 150 330 60 440 160 560 200 Z" fill="#8793A8"/><path d="M120 90 L150 112 100 130Z" fill="#eef1f5"/><path d="M330 60 L360 84 300 100Z" fill="#eef1f5"/>`;
    fg=`<path d="M0 220 H560 V180 Q280 150 0 180 Z" fill="#3f6f52"/>`+tree(90,150,1.3,'#2f5a41')+tree(470,155,1.4,'#2f5a41');
  } else if(type==='lake' || type==='water'){
    mid=tree(70,70,1.3,'#2f6a4e')+tree(150,80,1,'#357a58')+tree(430,72,1.4,'#2f6a4e')+tree(500,86,1,'#357a58');
    fg=`<rect x="0" y="176" width="560" height="64" fill="#6aa6ab"/><rect x="0" y="176" width="560" height="64" fill="url(#rip${type})" opacity=".5"/><path d="M0 176 Q280 158 560 176 V180 H0Z" fill="#4d8a86"/>`;
  } else if(type==='winter'){
    mid=tree(80,66,1.5,'#2c5142')+tree(180,80,1.1,'#356149')+tree(390,68,1.5,'#2c5142')+tree(480,82,1.2,'#356149');
    fg=`<path d="M0 240 V180 Q280 150 560 180 V240Z" fill="#f2f6fa"/><path d="M0 190 Q280 168 560 190" stroke="#dbe6ee" stroke-width="3" fill="none"/>`;
  } else { // forest / pines
    mid=tree(60,70,1.4,'#2f6248')+tree(150,82,1,'#38714f')+tree(240,74,1.3,'#2f6248')+tree(360,80,1.1,'#38714f')+tree(460,70,1.4,'#2f6248');
    fg=`<path d="M0 240 V182 Q280 160 560 182 V240Z" fill="#3c6b4f"/>`+tree(110,150,1.1,'#28503a')+tree(420,152,1.2,'#28503a');
  }

  return `<svg viewBox="0 0 560 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky${type}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient>
      <linearGradient id="rip${type}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="560" height="240" fill="url(#sky${type})"/>
    <circle cx="470" cy="52" r="30" fill="#FBE7B8" opacity=".85"/>
    ${mid}${fg}
    <g transform="translate(238,130)">
      <path d="M42 0 L84 34 V78 H0 V34 Z" fill="#6b4a2c"/>
      <path d="M42 0 L84 34 H0 Z" fill="#4f351f"/>
      <rect x="14" y="46" width="18" height="18" fill="#FBD98A"/>
      <rect x="52" y="46" width="18" height="18" fill="#FBD98A"/>
      <rect x="34" y="52" width="16" height="26" fill="#3a2716"/>
    </g>
  </svg>`;
};
