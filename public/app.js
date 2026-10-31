const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6zM12 3v4m9 4-4 0m-2 6 3 3m-9-3-3 3m1-9H3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  fire: '<path d="M12 3c1 5 5 5 5 9 1-1 2-2 2-4 3 5 2 13-7 13-6 0-9-4-8-9 1-4 4-5 4-8 2 2 2 4 2 5 2-2 2-4 2-6z"/>',
  laugh: '<circle cx="12" cy="12" r="9"/><path d="m7 9 1.5-1L10 9m4 0 1.5-1L17 9M7 13h10a5 5 0 0 1-10 0Z"/>',
  salt: '<path d="m9 4 6 1-1 4 4 10-1 2-11-2-1-2 6-8zM9 4l1-2 6 1-1 2m-7 8 8 1"/>',
  spark: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  logout: '<path d="M9 3H4v18h5m5-14 5 5-5 5M9 12h10"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  flag: '<path d="M4 22V3m0 0c5-3 10 3 16 0v11c-6 3-11-3-16 0"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.ball}</svg>`;
const state = { user: null, rooms: [], roomId: '', data: null, view: 'feed', filter: 'all', search: '', demo: true, config: {}, peer: null, messages: [], commentPost: null, comments: [], commentDrafts: {}, busy: false };
const names = { all: '전체 피드', match: 'FM 소식', talk: '라커룸', rumor: '이적시장' };
const kinds = { talk: '라커룸', banter: '도발 한 스푼', rumor: '이적시장', match: '매치데이', news: '풋볼 뉴스' };
const sampleTime = minutes => new Date(Date.now() - minutes * 60000).toISOString();
const demoMembers = [
  { id: 'demo-1', alias: '전술은거들뿐', avatar: 'violet', club: '맨체스터 유나이티드' },
  { id: 'demo-2', alias: '북런던의낭만', avatar: 'rose', club: '아스널' },
  { id: 'demo-3', alias: '원정석고양이', avatar: 'amber', club: '리버풀' },
  { id: 'demo-4', alias: '무리뉴의메모장', avatar: 'sky', club: '첼시' },
];
const demoData = {
  room: { id: 'demo', name: '주말엔 프리미어리그', season: '2026/27', ownerId: 'demo-1' },
  members: demoMembers,
  posts: [
    { id: 'sample-match', kind: 'match', author: { alias: '터치라인 AI', avatar: 'mint', bot: true }, createdAt: sampleTime(12), body: '올드 트래퍼드의 밤, 마지막에 웃은 건 홈 팬들.\n\n맨유가 아스널을 2–1로 꺾었습니다. 북런던 원정대의 귀갓길이 조금 길어지겠네요. 승점 3점보다 달콤한 건, 오늘 단체방의 발언권 아닐까요?', match: { home: '맨체스터 유나이티드', away: '아스널', homeScore: 2, awayScore: 1, gameDate: '2026. 10. 24', source: 'ai' }, reactions: { fire: 8, laugh: 5, salt: 3 }, commentCount: 12 },
    { id: 'sample-talk', kind: 'banter', author: demoMembers[0], createdAt: sampleTime(24), body: '아스널 감독님 혹시 인터넷 끊기셨나요?\n경기 끝나고 갑자기 조용하시네 👀', reactions: { fire: 3, laugh: 11, salt: 2 }, commentCount: 7 },
    { id: 'sample-rumor', kind: 'rumor', author: demoMembers[2], createdAt: sampleTime(45), body: '수비형 미드필더 급구합니다.\n공만 잘 뺏으면 됨. 우리 센터백 대신 사과도 잘하면 우대.', reactions: { laugh: 6, salt: 1 }, commentCount: 4 },
  ],
  matches: [{ id: 'sample-match', home: '맨체스터 유나이티드', away: '아스널', homeScore: 2, awayScore: 1, gameDate: '2026. 10. 24' }],
  inbox: demoMembers.map(m => ({ ...m, last: null, unread: 0 })), aiEnabled: false,
};
const avatar = (person, size = '') => `<span class="avatar ${esc(person?.avatar || 'mint')} ${size}">${person?.bot ? icon('spark') : esc((person?.alias || '?').slice(0, 1))}</span>`;
const timeAgo = time => { const m = Math.max(0, Math.floor((Date.now() - new Date(time)) / 60000)); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`; };
const clockTime = time => new Date(time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200); }
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || '요청을 처리하지 못했습니다.'); error.status = response.status; throw error; }
  return data;
}
function actionButton(label, action, cls = '', extra = '') { return `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`; }
const requireUser = () => { if (!state.user) { authModal('register'); return false; } if (state.demo) { roomModal(); return false; } return true; };
function currentData() { return state.data || demoData; }
function unreadCount() { return currentData().inbox.reduce((sum, c) => sum + c.unread, 0); }

function render() {
  const data = currentData();
  const user = state.user || { alias: '익명의 감독', avatar: 'slate' };
  $('#app').innerHTML = `<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#" data-action="home"><img src="/icon.svg" alt=""><span>TOUCHLINE<small>우리끼리의 축구 이야기</small></span></a>
      <div class="sidebar-caption">MY LEAGUE</div>
      <button class="league-switch" data-action="rooms">${icon('trophy')}<span>${esc(data.room.name)}<small>${esc(data.room.season)} 시즌${state.demo ? ' · 미리보기' : ''}</small></span>${icon('down')}</button>
      <nav class="main-nav" aria-label="주 메뉴">
        ${navButton('feed', 'home', '피드')}${navButton('messages', 'mail', '쪽지함', unreadCount())}${navButton('members', 'users', '우리 리그')}${navButton('profile', 'user', '내 프로필')}
      </nav>
      <button class="new-post" data-action="write">${icon('plus')} 한마디 남기기</button>
      <div class="sidebar-bottom"><div class="private-note">${icon('lock')}<span>우리 리그, 우리 이야기<small>초대받은 감독들만 함께해요.</small></span></div>
      <button class="account" data-action="${state.user ? 'profile' : 'login'}">${avatar(user)}<span>${esc(user.alias)}<small>${state.user ? '익명 프로필' : '로그인하고 참여하기'}</small></span>${icon('more')}</button></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="top-title"><span class="mobile-brand"><img src="/icon.svg" alt="터치라인"></span><span>${icon('lock')} PRIVATE LEAGUE</span><b>${esc(data.room.name)}</b></div><div class="top-actions">${state.demo ? '<span class="demo-tag">미리보기</span>' : '<span class="connection"><i></i> 연결됨</span>'}<button class="icon-button" data-action="${state.user ? 'invite' : 'register'}" aria-label="${state.user ? '친구 초대' : '회원가입'}">${icon('plus')}</button></div></header>
      ${state.demo ? `<div class="preview-notice"><span>지금은 예시 리그를 둘러보고 있어요.</span><button data-action="${state.user ? 'rooms' : 'register'}">${state.user ? '내 리그 시작하기' : '내 라커룸 만들기'} ${icon('arrow')}</button></div>` : ''}
      <div class="columns"><main id="main" class="main-content">${mainView()}</main><aside class="rightbar" id="rightbar">${rightView()}</aside></div>
      <footer class="site-footer"><span>TOUCHLINE</span> 경기는 FM에서, 이야기는 여기서.</footer>
    </div>
    <nav class="mobile-nav" aria-label="모바일 메뉴">${navButton('feed', 'home', '피드')}${navButton('messages', 'mail', '쪽지', unreadCount())}${navButton('members', 'users', '리그')}${navButton('profile', 'user', '프로필')}</nav>
  </div>`;
}
function navButton(view, name, label, badge = 0) { return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-action="nav" data-view="${view}">${icon(name)}<span>${label}</span>${badge ? `<b class="count">${badge}</b>` : ''}</button>`; }
function mainView() {
  if (state.view === 'messages') return messagesView();
  if (state.view === 'members') return membersView();
  if (state.view === 'profile') return profileView();
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow">AFTER THE WHISTLE</span><h1>90분은 끝났고,<br>진짜 경기는 여기서.</h1><p>감독의 품격은 잠시 벤치에 두세요.</p></div><div class="pitch-art" aria-hidden="true"><div class="pitch-half"></div><div class="pitch-circle"></div><div class="pitch-goal"></div><span class="pitch-dot one"></span><span class="pitch-dot two"></span><span class="pitch-dot three"></span><span class="pitch-ball">${icon('ball')}</span><span class="pitch-label">OFF THE PITCH. ON THE RECORD.</span></div></section>
    <div class="feed-heading"><h2>라커룸 피드 <span>${state.demo ? 'DEMO' : 'LIVE'}</span></h2><button class="icon-button" data-action="search" aria-label="피드 검색">${icon('search')}</button></div>
    <div class="tabs" role="tablist" aria-label="피드 필터">${Object.entries(names).map(([k, v]) => `<button role="tab" aria-selected="${state.filter === k}" class="${state.filter === k ? 'selected' : ''}" data-action="filter" data-filter="${k}">${v}</button>`).join('')}</div>
    <div id="search-wrap" ${state.search ? '' : 'hidden'}><label class="search-field">${icon('search')}<input id="feed-search" placeholder="게시글 내용 또는 닉네임 검색" value="${esc(state.search)}"><button class="icon-button" data-action="clear-search" aria-label="검색 닫기">${icon('close')}</button></label></div>
    ${composer()}<div id="feed-list">${feedPosts()}</div><div class="feed-end"><span></span>${icon('ball')}<span></span><p>오늘의 이야기는 계속됩니다.</p></div>`;
}
function composer() {
  return `<form id="compose-form" class="composer">${avatar(state.user || { alias: '?', avatar: 'slate' })}<div class="composer-main"><label class="sr-only" for="post-body">게시글 내용</label><textarea id="post-body" name="body" rows="2" maxlength="2000" placeholder="오늘 경기, 한마디 안 할 수 없죠?" required></textarea><div class="composer-bottom"><div class="compose-kinds"><label><input type="radio" name="kind" value="talk" checked><span>${icon('chat')} 잡담</span></label><label><input type="radio" name="kind" value="banter"><span>${icon('fire')} 도발</span></label><label><input type="radio" name="kind" value="rumor"><span>${icon('flag')} 이적설</span></label></div><button class="button primary small" type="submit">게시하기 ${icon('arrow')}</button></div></div></form>`;
}
function feedPosts() {
  const posts = currentData().posts.filter(p => (state.filter === 'all' || (state.filter === 'talk' ? ['talk', 'banter'].includes(p.kind) : state.filter === 'match' ? ['match', 'news'].includes(p.kind) : p.kind === state.filter)) && (!state.search || `${p.body} ${p.author.alias}`.toLowerCase().includes(state.search.toLowerCase())));
  return posts.length ? posts.map(postCard).join('') : `<div class="empty-state">${icon(state.search ? 'search' : 'chat')}<h3>${state.search ? '아직 그런 이야기는 없네요.' : '첫 번째 이야기를 기다리고 있어요.'}</h3><p>${state.search ? '다른 검색어나 피드 탭을 선택해 보세요.' : '인사도 좋고, 가벼운 선전포고도 좋아요.'}</p></div>`;
}
function scoreBoard(match, small = false) {
  return `<div class="scoreboard ${small ? 'compact' : ''}"><div class="score-meta"><span>${icon('ball')} ${small ? '최근 경기' : esc(match.gameDate || '경기 결과')}</span><span class="ft">FULL TIME</span></div><div class="score-line"><div class="team"><span class="crest home-crest">${esc(match.home.slice(0, 1))}</span><b>${esc(match.home)}</b></div><div class="score"><strong>${match.homeScore}<span>:</span>${match.awayScore}</strong><small>최종 스코어</small></div><div class="team"><span class="crest away-crest">${esc(match.away.slice(0, 1))}</span><b>${esc(match.away)}</b></div></div></div>`;
}
function postCard(post) {
  return `<article class="post-card" data-post="${esc(post.id)}"><div class="post-top">${avatar(post.author)}<div class="post-author"><b>${esc(post.author.alias)}${post.author.bot ? `<span class="bot-badge">${state.demo || post.article || post.match?.source === 'ai' ? 'AI' : 'BOT'}</span>` : ''}</b><span>${timeAgo(post.createdAt)} <i>·</i> ${post.author.bot ? (post.article ? '우리 세이브의 축구 소식' : post.match?.source === 'summary' ? '입력한 기록으로 작성' : '가상 기자의 경기 이야기') : '익명의 감독'}</span></div><span class="post-kind ${post.kind}">${kinds[post.kind]}</span>${post.canDelete ? `<button class="icon-button subtle" data-action="delete-post" data-id="${post.id}" aria-label="게시글 삭제">${icon('trash')}</button>` : ''}</div>
    ${post.match ? scoreBoard(post.match) : ''}${post.article ? `<div class="news-heading"><span>TOUCHLINE FOOTBALL · 가상 뉴스</span><h2>${esc(post.article.headline)}</h2></div>` : ''}<div class="post-body">${esc(post.body)}</div>
    ${post.previewComments?.length && state.commentPost !== post.id ? `<section class="fan-preview"><div class="fan-caption">지금 팬들은 <span>AI 가상 팬 반응</span></div>${post.previewComments.map(c => `<div class="fan-line"><b>${esc(c.name)}</b><p>${esc(c.body)}</p></div>`).join('')}<button class="text-button" data-action="comments" data-id="${post.id}">나도 한마디 남기기 ${icon('arrow')}</button></section>` : ''}
    ${post.capture?.hasImage ? `<details class="source-details"><summary>경기 자료 보기</summary><a class="capture-preview" href="/api/posts/${encodeURIComponent(post.id)}/image" target="_blank" rel="noopener"><img src="/api/posts/${encodeURIComponent(post.id)}/image" alt="기사 작성에 참고한 게임 화면" loading="lazy"></a></details>` : ''}
    <div class="post-actions"><div class="reactions">${[['fire', '불붙었다'], ['laugh', '웃겨요'], ['salt', '긁혔어요']].map(([k, label]) => `<button class="reaction ${post.myReaction === k ? 'on' : ''}" data-action="react" data-id="${post.id}" data-kind="${k}" aria-label="${label}" aria-pressed="${post.myReaction === k}" title="${label}">${icon(k)}<span>${post.reactions[k] || 0}</span></button>`).join('')}</div><button class="comment-button" data-action="comments" data-id="${post.id}" aria-expanded="${state.commentPost === post.id}">${icon('chat')} ${state.commentPost === post.id ? '댓글 접기' : '댓글'} <b>${post.commentCount}</b></button></div>${state.commentPost === post.id ? inlineComments(post.id) : ''}</article>`;
}
function rightView() {
  const data = currentData();
  const latest = data.matches[0];
  return `<section class="league-card"><div class="section-eyebrow">THE INNER CIRCLE ${icon('lock')}</div><h3>우리 리그의 온도</h3><p>같은 세이브, 다른 속마음.</p><div class="league-stats"><div><strong>${data.members.length.toString().padStart(2, '0')}</strong><span>참여 감독</span></div><div><strong>${data.posts.length.toString().padStart(2, '0')}</strong><span>최근 게시글</span></div><div><strong>${data.matches.length.toString().padStart(2, '0')}</strong><span>최근 경기</span></div></div><div class="avatar-stack">${data.members.slice(0, 5).map(m => avatar(m, 'tiny')).join('')}<span>${state.demo ? '예시 리그를 구경 중' : '우리끼리만 공유 중'}</span></div><button class="button outline wide" data-action="invite">${icon('plus')} 친구 초대하기</button></section>
    ${latest ? `<section class="sidebar-section"><div class="section-title"><h3>휘슬이 울렸어요</h3>${icon('ball')}</div>${scoreBoard(latest, true)}<button class="text-button" data-action="filter" data-filter="match">경기 이야기 보러 가기 ${icon('arrow')}</button></section>` : ''}
    <section class="sidebar-section"><div class="section-title"><h3>라커룸 멤버</h3><span>${data.members.length}</span></div><div class="member-list">${data.members.slice(0, 5).map(m => `<button class="member-row" data-action="dm" data-id="${m.id}">${avatar(m, 'small-avatar')}<span><b>${esc(m.alias)}${m.id === state.user?.id ? ' <em>나</em>' : ''}</b><small>${esc(m.club || '구단 미설정')}</small></span>${icon(m.id === state.user?.id ? 'user' : 'mail')}</button>`).join('')}</div></section>
    <div class="sideline-note"><span>KEEP IT ON THE TOUCHLINE.</span><p>닉네임 뒤에 숨은 건 친구.<br>라이벌에게 한마디, 경기 뒤엔 악수.</p><div>${icon('ball')} FOOTBALL. FRIENDS. A LITTLE CHAOS.</div></div>`;
}
function membersView() {
  const data = currentData();
  return `<div class="page-heading"><span class="eyebrow dark">THE INNER CIRCLE</span><h1>같은 리그, 다른 야망.</h1><p>익숙한 친구들이 조금 낯선 닉네임으로.</p></div><section class="panel room-info"><div><span class="label">우리의 세이브</span><h2>${esc(data.room.name)}</h2><p>${esc(data.room.season)} · ${data.members.length}명의 감독</p></div><button class="button primary" data-action="invite">${icon('plus')} 초대하기</button></section>
    ${!state.demo && state.user?.id === data.room.ownerId ? `<section class="panel match-publish"><div>${icon('spark')}<h3>FM 소식이 알아서 올라오게.</h3><p>내 PC의 받은편지함을 우리 리그 피드에 연결하세요.</p></div><button class="button primary" data-action="collectors">자동 수집 설정</button></section>` : ''}
    <div class="members-grid">${data.members.map(m => `<article class="member-card">${avatar(m, 'large')}<h3>${esc(m.alias)}${m.id === state.user?.id ? ' <span class="badge-neutral">나</span>' : ''}</h3><p>${esc(m.club || '담당 구단을 아직 정하지 않았어요')}</p><span class="member-role">${m.id === data.room.ownerId ? '리그 운영자' : '리그 참가자'}</span><button class="button outline wide" data-action="dm" data-id="${m.id}">${icon(m.id === state.user?.id ? 'user' : 'mail')} ${m.id === state.user?.id ? '내 프로필' : '슬쩍 쪽지 보내기'}</button></article>`).join('')}</div>
    ${!state.demo && state.user?.id === data.room.ownerId ? `<section class="panel match-publish"><div>${icon('ball')}<h3>오늘 경기, 피드에 올려요.</h3><p>결과와 경기 메모를 넣으면 ${data.aiEnabled ? 'AI 기사와 팬 반응' : '기록 기반 요약'}이 게시됩니다.</p></div><button class="button dark-button" data-action="match">경기 기록 추가 ${icon('plus')}</button></section>` : ''}`;
}
function messagesView() {
  if (state.peer) return conversationView();
  const inbox = currentData().inbox;
  return `<div class="page-heading"><span class="eyebrow dark">JUST BETWEEN US</span><h1>쪽지함<span class="heading-dot"></span></h1><p>공개적으로는 못 할 이야기, 여기서 조용히.</p></div><div class="dm-note">${icon('lock')} 같은 리그의 감독끼리 나누는 1:1 대화</div><section class="panel inbox">${inbox.filter(m => m.id !== state.user?.id).map(m => `<button class="inbox-row" data-action="dm" data-id="${m.id}">${avatar(m, 'large')}<span class="inbox-copy"><b>${esc(m.alias)}</b><span>${esc(m.last ? `${m.last.mine ? '나: ' : ''}${m.last.body}` : `${m.club || '같은 리그의 감독'} · 먼저 말을 걸어 보세요`)}</span></span><span class="inbox-end">${m.last ? `<small>${timeAgo(m.last.createdAt)}</small>` : ''}${m.unread ? `<b class="count">${m.unread}</b>` : icon('chevron')}</span></button>`).join('') || `<div class="empty-state">${icon('mail')}<h3>쪽지를 보낼 친구가 필요해요.</h3><p>리그에 친구를 초대하면 대화를 시작할 수 있어요.</p><button class="button primary" data-action="invite">친구 초대하기</button></div>`}</section><p class="privacy-caption">대화는 참여자에게만 표시됩니다. 종단간 암호화는 아니며 서버 운영자는 저장 데이터에 접근할 수 있습니다.</p>`;
}
function conversationView() {
  return `<section class="conversation panel"><header class="conversation-head"><button class="icon-button" data-action="inbox" aria-label="쪽지함으로 돌아가기">${icon('back')}</button>${avatar(state.peer)}<span><b>${esc(state.peer.alias)}</b><small>${esc(state.peer.club || '우리 리그')} · 1:1 대화</small></span>${icon('lock')}</header><div id="message-list" class="message-list">${messageBubbles()}</div><form id="message-form" class="message-form"><label class="sr-only" for="message-body">쪽지 내용</label><input id="message-body" name="body" maxlength="2000" placeholder="감독님, 잠깐 이야기 좀 하시죠." autocomplete="off" required><button class="send-button" type="submit" aria-label="쪽지 보내기">${icon('send')}</button></form></section><p class="privacy-caption">친구에게 보이는 것은 익명 닉네임뿐이에요.</p>`;
}
function messageBubbles() {
  return `<div class="conversation-start">${icon('lock')} ${esc(state.peer.alias)} 님과의 대화 시작</div>${state.messages.map(m => `<div class="message ${m.mine ? 'mine' : ''}"><div>${esc(m.body)}</div><small>${m.mine ? (m.read ? '읽음 · ' : '') : ''}${clockTime(m.createdAt)}</small></div>`).join('')}`;
}
function profileView() {
  if (!state.user) return `<div class="page-heading"><span class="eyebrow dark">YOUR ALTER EGO</span><h1>어떤 감독으로 불릴까요?</h1><p>로그인 ID는 비공개. 친구들은 닉네임만 볼 수 있어요.</p></div><section class="panel welcome-profile">${avatar({ alias: '?', avatar: 'mint' }, 'large')}<h2>우리끼리의 또 다른 나.</h2><p>익명 프로필로 피드에 참여하고<br>라이벌에게 은밀한 쪽지를 보내 보세요.</p><button class="button primary" data-action="register">내 계정 만들기 ${icon('arrow')}</button><button class="text-button" data-action="login">이미 계정이 있어요</button></section>`;
  const user = state.user;
  const membership = currentData().members.find(m => m.id === user.id);
  return `<div class="page-heading"><span class="eyebrow dark">YOUR ALTER EGO</span><h1>닉네임 뒤의 감독.</h1><p>친구들이 알던 나와는 조금 달라도 괜찮아요.</p></div><form id="profile-form" class="panel profile-form"><div class="profile-avatar">${avatar(user, 'large')}<span><b>${esc(user.alias)}</b><small>로그인 ID는 다른 사람에게 공개되지 않아요.</small></span></div><label>익명 닉네임<input name="alias" value="${esc(user.alias)}" minlength="2" maxlength="20" required></label><fieldset class="avatar-picker"><legend>프로필 컬러</legend>${['mint', 'violet', 'amber', 'rose', 'sky', 'slate'].map(a => `<label class="color-option ${a}"><input type="radio" name="avatar" value="${a}" ${user.avatar === a ? 'checked' : ''}><span>${icon('check')}</span><span class="sr-only">${a}</span></label>`).join('')}</fieldset>${state.demo ? '' : `<label>현재 리그의 담당 구단<input name="club" value="${esc(membership?.club || '')}" maxlength="30" placeholder="예: 맨체스터 유나이티드"></label>`}<div class="form-error" role="alert"></div><button class="button primary" type="submit">프로필 저장 ${icon('check')}</button></form><section class="panel profile-tools"><button data-action="rooms">${icon('trophy')} 리그 만들기 / 참여하기 ${icon('chevron')}</button><button data-action="logout">${icon('logout')} 로그아웃 ${icon('chevron')}</button></section>`;
}

let modalLastFocus;
function openModal(title, html, cls = '') {
  modalLastFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-overlay"><section class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></header>${html}</section></div>`;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => $('.modal input:not([type=radio]), .modal textarea, .modal button')?.focus());
}
function closeModal() { $('#modal-root').innerHTML = ''; document.body.classList.remove('modal-open'); modalLastFocus?.focus?.(); }
function authModal(mode) {
  const register = mode === 'register';
  openModal(register ? '라커룸에 오신 걸 환영해요.' : '감독님, 돌아오셨네요.', `<p class="modal-desc">${register ? '친구에게는 닉네임만. 우리 리그에서 새롭게 시작해요.' : '익명 계정으로 우리 리그에 입장하세요.'}</p><form id="auth-form" data-mode="${mode}">${register ? '<label>익명 닉네임<input name="alias" minlength="2" maxlength="20" placeholder="예: 전술은거들뿐" autocomplete="nickname" required></label>' : ''}<label>로그인 ID<input name="login" minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]+" placeholder="영문·숫자 3~32자" autocomplete="username" required></label><label>비밀번호<input name="password" type="password" minlength="${register ? 10 : 1}" maxlength="128" placeholder="${register ? '10자 이상' : '비밀번호 입력'}" autocomplete="${register ? 'new-password' : 'current-password'}" required></label><div class="form-error" role="alert"></div><button class="button primary wide" type="submit">${register ? '계정 만들기' : '로그인'} ${icon('arrow')}</button></form><div class="modal-footer">${register ? '이미 계정이 있나요?' : '아직 계정이 없나요?'} <button class="text-button" data-action="${register ? 'login' : 'register'}">${register ? '로그인' : '계정 만들기'}</button></div>`);
}
function roomModal(mode = 'join') {
  if (!state.user) return authModal('register');
  openModal('우리 리그로 모이세요.', `<p class="modal-desc">같은 세이브를 즐기는 친구들끼리 한 공간에서.</p>${state.rooms.length ? `<div class="existing-rooms">${state.rooms.map(r => `<button data-action="switch-room" data-id="${r.id}">${icon('trophy')}<span>${esc(r.name)}<small>${esc(r.season)} · ${r.count}명</small></span>${icon('arrow')}</button>`).join('')}</div>` : ''}<div class="modal-tabs"><button class="${mode === 'join' ? 'selected' : ''}" data-action="room-join-tab">초대 코드로 참여</button><button class="${mode === 'create' ? 'selected' : ''}" data-action="room-create-tab">새 리그 만들기</button></div><form id="room-form" data-mode="${mode}">${mode === 'create' ? `<label>리그 이름<input name="name" minlength="2" maxlength="40" placeholder="예: 주말엔 프리미어리그" required></label><label>시즌<input name="season" value="2026/27" maxlength="20" required></label>${state.config.joinKeyRequired ? '<label>서버 방 생성 키<input name="joinKey" type="password" placeholder="서버 운영자에게 받은 키" required></label>' : ''}` : '<label>초대 코드<input name="invite" minlength="6" maxlength="32" placeholder="친구에게 받은 코드를 입력하세요" autocomplete="off" required></label>'}<label>담당 구단 <span class="optional">선택</span><input name="club" maxlength="30" placeholder="예: 리버풀"></label><div class="form-error" role="alert"></div><button class="button primary wide" type="submit">${mode === 'create' ? '우리 리그 만들기' : '라커룸 입장하기'} ${icon('arrow')}</button></form>`);
}
function inviteModal() {
  if (!requireUser()) return;
  const room = currentData().room;
  if (!room.invite) return openModal('친구 초대하기', `<p class="modal-desc">리그 운영자에게 초대 코드를 요청해 주세요. 코드는 운영자만 조회하고 변경할 수 있어요.</p><button class="button primary wide" data-action="close-modal">확인</button>`);
  openModal('한 자리 더 비워뒀어요.', `<p class="modal-desc">친구에게 이 사이트 주소와 아래 코드를 전달해 주세요.<br>계정을 만든 뒤 초대 코드로 입장하면 됩니다.</p><div class="invite-code"><code>${esc(room.invite)}</code><button class="icon-button" data-action="copy-invite" aria-label="초대 코드 복사">${icon('copy')}</button></div><p class="helper">리그: ${esc(room.name)} · ${esc(room.season)}</p><button class="button primary wide" data-action="copy-invite">초대 코드 복사 ${icon('copy')}</button><button class="text-button rotate-invite" data-action="rotate-invite">기존 코드를 닫고 새 코드 만들기</button><p class="helper">코드를 바꾸어도 이미 참여한 멤버는 유지됩니다.</p>`);
}
function collectorsModal() {
  if (!requireUser()) return;
  openModal('FM 자동 수집 연결', `<p class="modal-desc">FM이 앞에 열려 있고 받은편지함이 갱신되면 화면과 소식을 이 리그에 공유합니다. 게임이 최소화되어 있으면 대기합니다.</p><div class="collector-list">${(currentData().collectors || []).map(c => `<div><b>${esc(c.name)}</b><small>${c.last_seen ? `마지막 수집: ${esc(new Date(c.last_seen).toLocaleString('ko-KR'))}` : '첫 수집 대기 중'}</small><button class="text-button" data-action="revoke-collector" data-id="${esc(c.id)}">연결 해제</button></div>`).join('')}</div><form id="collector-form"><label>PC 이름<input name="name" value="내 PC의 FM" maxlength="40" required></label><div class="form-error" role="alert"></div><button class="button primary wide" type="submit">새 연결 키 만들기</button></form>`);
}
function collectorKeyModal(result) {
  const config = `TOUCHLINE_URL=${location.origin}\nCOLLECTOR_TOKEN=${result.token}\nFM_VERSION=27\nFM_EXECUTABLE="C:/Program Files (x86)/Steam/steamapps/common/Football Manager 27/fm.exe"\nCAPTURE_MODE=screen\n`;
  openModal('PC 연결 설정이 준비됐어요.', `<p class="modal-desc">아래 내용을 프로젝트의 <code>collector/.env</code> 파일에 저장하세요. 연결 키는 이 화면에서만 표시됩니다.</p><textarea id="collector-config" class="collector-config" rows="6" readonly aria-label="수집기 연결 설정">${esc(config)}</textarea><button class="button primary wide" data-action="copy-collector">설정 복사</button><p class="helper">프로젝트 폴더에서 실행:</p><code class="collector-command">node --env-file-if-exists=collector/.env collector/index.js</code><p class="helper">키를 가진 PC는 이 리그에 소식을 올릴 수 있습니다. 종료는 Ctrl+C, 키 폐기는 자동 수집 설정의 연결 해제를 이용하세요.</p>`);
}
function matchModal() {
  if (!requireUser()) return;
  openModal('휘슬이 울렸다면, 기록하세요.', `<p class="modal-desc">직접 확인한 경기 결과를 입력하세요. ${currentData().aiEnabled ? '로컬 AI가 기사와 가상의 팬 반응을 작성합니다.' : '입력한 사실로 요약을 만듭니다. 서버에 Ollama 모델을 연결하면 AI 기사도 쓸 수 있어요.'}</p><form id="match-form"><div class="form-columns"><label>홈 팀<input name="home" maxlength="40" placeholder="맨체스터 유나이티드" required></label><label>원정 팀<input name="away" maxlength="40" placeholder="아스널" required></label></div><div class="form-columns"><label>홈 스코어<input name="homeScore" type="number" min="0" max="99" value="0" required></label><label>원정 스코어<input name="awayScore" type="number" min="0" max="99" value="0" required></label></div><label>게임 내 날짜<input name="gameDate" maxlength="30" placeholder="예: 2026. 10. 24"></label><label>경기 메모 <span class="optional">선택</span><textarea name="note" rows="3" maxlength="2000" placeholder="득점자, 주요 장면 등 확인한 사실을 적어 주세요."></textarea></label><div class="form-error" role="alert"></div><button class="button primary wide" type="submit">${currentData().aiEnabled ? '기사와 팬 반응 생성' : '경기 요약 게시'} ${icon('spark')}</button></form>`);
}
function updateFeed() {
  if (!$('#feed-list')) return;
  const existingForm = $('#comment-form');
  const active = document.activeElement;
  const focused = active?.id === 'comment-body';
  const start = focused ? active.selectionStart : 0, end = focused ? active.selectionEnd : 0;
  const scroll = window.scrollY;
  $('#feed-list').innerHTML = feedPosts();
  const replacementForm = $('#comment-form');
  if (existingForm && replacementForm?.dataset.postId === existingForm.dataset.postId) replacementForm.replaceWith(existingForm);
  if (focused && $('#comment-body')) { $('#comment-body').focus({ preventScroll: true }); $('#comment-body').setSelectionRange(start, end); }
  window.scrollTo({ top: scroll, behavior: 'instant' });
}
function inlineComments(postId) {
  return `<section class="inline-comments" aria-label="게시글 댓글"><div id="comments-list" class="comments-list">${commentsList()}</div><form id="comment-form" data-post-id="${esc(postId)}"><label class="sr-only" for="comment-body">댓글 내용</label><textarea id="comment-body" name="body" rows="2" maxlength="1000" placeholder="팬들 사이에 한마디 남겨보세요…" required>${esc(state.commentDrafts[postId] || '')}</textarea><div class="inline-comment-bottom"><span>내 익명 닉네임으로 참여</span><button class="button primary small" type="submit">댓글 남기기 ${icon('send')}</button></div><div class="form-error" role="alert"></div></form></section>`;
}
async function toggleComments(postId) {
  const post = currentData().posts.find(p => p.id === postId);
  if (!post) return;
  if (state.demo) return authModal('register');
  if (state.commentPost === postId) { state.commentPost = null; updateFeed(); return; }
  state.commentPost = postId; state.comments = [];
  let result;
  try { result = await api(`/posts/${postId}/comments`); }
  catch (error) { if (state.commentPost === postId) state.commentPost = null; throw error; }
  if (state.commentPost !== postId) return;
  state.comments = result.comments;
  updateFeed();
}
function commentsList() { return state.comments.length ? state.comments.map(c => `<div class="comment">${avatar(c.author, 'small-avatar')}<div><b>${esc(c.author.alias)}${c.author.bot ? '<span class="bot-badge">AI</span>' : ''}</b><p>${esc(c.body)}</p><small>${timeAgo(c.createdAt)}</small></div></div>`).join('') : '<p class="empty-comments">아직 조용하네요. 첫 댓글의 주인공이 되어 보세요.</p>'; }

let refreshActive = false;
async function refresh(quiet = false) {
  if (state.demo || !state.roomId || refreshActive) return;
  refreshActive = true;
  const roomId = state.roomId;
  try {
    const data = await api(`/rooms/${roomId}/state`);
    if (state.roomId !== roomId) return;
    const changed = JSON.stringify(state.data) !== JSON.stringify(data);
    state.data = data;
    if (!quiet) render();
    else if (changed) {
      if (state.view === 'feed') updateFeed();
      if (state.view === 'members') $('#main').innerHTML = membersView();
      if (state.view === 'messages' && !state.peer) $('#main').innerHTML = messagesView();
      $('#rightbar').innerHTML = rightView();
      document.querySelectorAll('[data-view="messages"]').forEach(el => { $('.count', el)?.remove(); if (unreadCount()) el.insertAdjacentHTML('beforeend', `<b class="count">${unreadCount()}</b>`); });
    }
    $('.connection')?.classList.remove('offline');
    const conn = $('.connection'); if (conn) conn.innerHTML = '<i></i> 연결됨';
    if (state.peer && state.view === 'messages') await refreshMessages();
    if (state.commentPost && $('#comments-list')) {
      const postId = state.commentPost;
      const result = await api(`/posts/${postId}/comments`);
      if (postId === state.commentPost && $('#comments-list')) {
        if (JSON.stringify(result.comments) !== JSON.stringify(state.comments)) { state.comments = result.comments; $('#comments-list').innerHTML = commentsList(); }
      }
    }
  } catch (error) {
    const conn = $('.connection'); if (conn) { conn.classList.add('offline'); conn.innerHTML = '<i></i> 재연결 중'; }
    if (!quiet) throw error;
    if (error.status === 401) { state.user = null; state.demo = true; state.data = null; state.roomId = ''; state.peer = null; closeModal(); render(); toast('로그인이 만료됐어요. 다시 입장해 주세요.'); }
  } finally { refreshActive = false; }
}
async function selectRoom(roomId) {
  state.commentPost = null; state.comments = [];
  state.roomId = roomId; state.demo = false; state.peer = null; state.view = 'feed'; state.filter = 'all'; state.search = ''; state.data = null;
  localStorage.setItem('touchline-room', roomId);
  closeModal();
  const data = await api(`/rooms/${roomId}/state`);
  if (state.roomId === roomId) { state.data = data; render(); }
}
async function openDm(peerId) {
  if (peerId === state.user?.id) { state.view = 'profile'; render(); return; }
  if (!requireUser()) return;
  const result = await api(`/rooms/${state.roomId}/messages/${peerId}`);
  state.peer = result.peer; state.messages = result.messages; state.view = 'messages'; render(); scrollMessages();
  await api(`/rooms/${state.roomId}/messages/${peerId}/read`, { method: 'POST', body: {} });
}
function scrollMessages() { const list = $('#message-list'); if (list) list.scrollTop = list.scrollHeight; }
async function refreshMessages() {
  const peerId = state.peer?.id; const roomId = state.roomId;
  if (!peerId) return;
  const result = await api(`/rooms/${roomId}/messages/${peerId}`);
  if (state.peer?.id !== peerId || state.roomId !== roomId) return;
  const list = $('#message-list');
  if (JSON.stringify(result.messages) !== JSON.stringify(state.messages)) {
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 100;
    state.messages = result.messages;
    if (list) { list.innerHTML = messageBubbles(); if (atBottom) scrollMessages(); }
  }
  if (document.visibilityState === 'visible' && result.messages.some(m => !m.mine && !m.read)) await api(`/rooms/${roomId}/messages/${peerId}/read`, { method: 'POST', body: {} });
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) { if (event.target.classList.contains('modal-overlay')) closeModal(); return; }
  event.preventDefault();
  const { action, id: itemId } = target.dataset;
  try {
    if (action === 'close-modal') return closeModal();
    if (action === 'register' || action === 'login') return authModal(action);
    if (action === 'home') { state.view = 'feed'; state.peer = null; render(); return; }
    if (action === 'nav' || action === 'profile') { state.view = action === 'profile' ? 'profile' : target.dataset.view; state.peer = null; render(); return; }
    if (action === 'rooms') return roomModal();
    if (action === 'room-create-tab') return roomModal('create');
    if (action === 'room-join-tab') return roomModal('join');
    if (action === 'switch-room') return await selectRoom(itemId);
    if (action === 'invite') return inviteModal();
    if (action === 'collectors') return collectorsModal();
    if (action === 'copy-collector') {
      if (!navigator.clipboard?.writeText) { $('#collector-config').select(); return toast('선택된 설정을 복사해 주세요.'); }
      await navigator.clipboard.writeText($('#collector-config').value); return toast('연결 설정을 복사했어요.');
    }
    if (action === 'revoke-collector') { await api(`/rooms/${state.roomId}/collectors/${itemId}`, { method: 'DELETE', body: {} }); await refresh(); collectorsModal(); return; }
    if (action === 'copy-invite') {
      const code = currentData().room.invite;
      if (!navigator.clipboard?.writeText) return toast('초대 코드를 직접 선택해서 복사해 주세요.');
      await navigator.clipboard.writeText(code); return toast('초대 코드를 복사했어요. 친구에게 사이트 주소도 보내 주세요.');
    }
    if (action === 'rotate-invite') { const result = await api(`/rooms/${state.roomId}/invite`, { method: 'POST', body: {} }); state.data.room.invite = result.invite; inviteModal(); return toast('새 초대 코드가 준비됐어요.'); }
    if (action === 'write') { if (!requireUser()) return; state.view = 'feed'; state.filter = 'all'; render(); $('#post-body').focus(); $('#post-body').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (action === 'filter') { state.filter = target.dataset.filter; state.view = 'feed'; render(); return; }
    if (action === 'search') { $('#search-wrap').hidden = false; $('#feed-search').focus(); return; }
    if (action === 'clear-search') { state.search = ''; $('#search-wrap').hidden = true; $('#feed-search').value = ''; $('#feed-list').innerHTML = feedPosts(); return; }
    if (action === 'react') { if (!requireUser()) return; await api(`/posts/${itemId}/reaction`, { method: 'POST', body: { kind: target.dataset.kind } }); await refresh(true); return; }
    if (action === 'comments') return await toggleComments(itemId);
    if (action === 'dm') return await openDm(itemId);
    if (action === 'inbox') { state.peer = null; state.view = 'messages'; render(); return; }
    if (action === 'match') return matchModal();
    if (action === 'delete-post') return openModal('이 게시글을 삭제할까요?', `<p class="modal-desc">게시글과 달린 댓글, 반응이 함께 삭제됩니다.</p><div class="modal-button-row"><button class="button outline" data-action="close-modal">돌아가기</button><button class="button danger" data-action="confirm-delete" data-id="${itemId}">삭제하기</button></div>`);
    if (action === 'confirm-delete') { await api(`/posts/${itemId}`, { method: 'DELETE', body: {} }); closeModal(); await refresh(true); return toast('게시글을 삭제했어요.'); }
    if (action === 'logout') { await api('/auth/logout', { method: 'POST', body: {} }); state.user = null; state.rooms = []; state.roomId = ''; state.demo = true; state.data = null; state.peer = null; state.view = 'feed'; render(); return toast('로그아웃했어요. 다음 경기 때 만나요.'); }
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'comment-body') state.commentDrafts[event.target.closest('form').dataset.postId] = event.target.value;
  if (event.target.id === 'feed-search') { state.search = event.target.value; $('#feed-list').innerHTML = feedPosts(); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModal();
  const modal = $('.modal');
  if (modal && event.key === 'Tab') {
    const items = [...modal.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(el => !el.disabled && el.offsetParent !== null);
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
});
document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting) return;
  if (['compose-form', 'message-form', 'comment-form'].includes(form.id) && !requireUser()) return;
  const data = Object.fromEntries(new FormData(form));
  const button = $('button[type="submit"]', form);
  const original = button?.innerHTML;
  form.dataset.submitting = 'true';
  if (button) { button.disabled = true; button.textContent = form.id === 'match-form' ? '작성 중… 잠시만 기다려 주세요.' : '잠시만요…'; }
  const errorBox = $('.form-error', form); if (errorBox) errorBox.textContent = '';
  try {
    if (form.id === 'auth-form') {
      const result = await api(`/auth/${form.dataset.mode}`, { method: 'POST', body: data });
      state.user = result.user; state.rooms = result.rooms;
      closeModal();
      if (state.rooms.length) await selectRoom(state.rooms.find(r => r.id === localStorage.getItem('touchline-room'))?.id || state.rooms[0].id);
      else { render(); roomModal(); }
    }
    if (form.id === 'collector-form') {
      const result = await api(`/rooms/${state.roomId}/collectors`, { method: 'POST', body: data });
      await refresh(); collectorKeyModal(result);
    }
    if (form.id === 'room-form') {
      const result = await api(form.dataset.mode === 'create' ? '/rooms' : '/rooms/join', { method: 'POST', body: data });
      state.rooms = result.rooms; await selectRoom(result.room.id); toast('우리 리그에 입장했어요.');
    }
    if (form.id === 'compose-form') { await api(`/rooms/${state.roomId}/posts`, { method: 'POST', body: data }); form.reset(); await refresh(true); toast('한마디 남겼어요. 이제 반응을 기다려 볼까요?'); }
    if (form.id === 'comment-form') {
      const postId = form.dataset.postId;
      await api(`/posts/${postId}/comments`, { method: 'POST', body: data });
      delete state.commentDrafts[postId];
      $('textarea[name="body"]', form).value = '';
      const result = await api(`/posts/${postId}/comments`);
      if (state.commentPost === postId && $('#comments-list')) { state.comments = result.comments; $('#comments-list').innerHTML = commentsList(); $('#comments-list').scrollTop = $('#comments-list').scrollHeight; }
      await refresh(true);
    }
    if (form.id === 'message-form') { const peerId = state.peer.id; await api(`/rooms/${state.roomId}/messages/${peerId}`, { method: 'POST', body: data }); form.reset(); await refreshMessages(); scrollMessages(); }
    if (form.id === 'profile-form') {
      const result = await api('/me', { method: 'PATCH', body: data }); state.user = result.user;
      if (!state.demo) await api(`/rooms/${state.roomId}/membership`, { method: 'PATCH', body: { club: data.club } });
      if (state.demo) render(); else await refresh(); toast('프로필을 저장했어요.');
    }
    if (form.id === 'match-form') {
      const result = await api(`/rooms/${state.roomId}/matches`, { method: 'POST', body: data });
      closeModal(); state.view = 'feed'; state.filter = 'all'; await refresh(); toast(result.warning || '경기 이야기가 피드에 올라왔어요.');
    }
  } catch (error) { if (errorBox) errorBox.textContent = error.message; else toast(error.message); }
  finally { delete form.dataset.submitting; if (button?.isConnected) { button.disabled = false; button.innerHTML = original; } }
});

async function init() {
  render();
  try {
    state.config = await api('/config');
    const result = await api('/me');
    state.user = result.user; state.rooms = result.rooms;
    if (state.rooms.length) await selectRoom(state.rooms.find(r => r.id === localStorage.getItem('touchline-room'))?.id || state.rooms[0].id);
    else render();
  } catch (error) { if (error.status !== 401) toast('서버 연결을 확인해 주세요. 현재는 미리보기입니다.'); }
}
setInterval(() => { if (document.visibilityState === 'visible') refresh(true).catch(() => {}); }, 4000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(true).catch(() => {}); });
init();
