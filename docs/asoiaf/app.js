const data = await fetch("data/atlas.json").then((response) => {
  if (!response.ok) throw new Error(`Atlas data failed: ${response.status}`);
  return response.json();
});

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const standing = document.querySelector("#standing");
for (const item of data.standing) {
  const card = el("article", "metric");
  card.append(el("div", "metric-value", item.value));
  const body = el("div");
  body.append(el("div", "metric-label", item.label), el("p", "metric-note", item.note));
  card.append(body);
  standing.append(card);
}

const claim = document.querySelector("#claim-class");
for (const frame of data.questionFrames) {
  const option = el("option", "", frame.label);
  option.value = frame.id;
  claim.append(option);
}
const evidence = document.querySelector("#evidence-lane");
for (const lane of data.sourceLanes) {
  const option = el("option", "", lane.name);
  option.value = lane.id;
  evidence.append(option);
}

document.querySelector("#question-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const frame = data.questionFrames.find((item) => item.id === claim.value);
  const lane = data.sourceLanes.find((item) => item.id === evidence.value);
  const question = document.querySelector("#question-text").value.trim() || "[question not supplied]";
  const continuity = document.querySelector("#continuity").selectedOptions[0].textContent;
  const packet = {
    format: "axm-asoiaf-review-question/1",
    question,
    claimClass: frame.label,
    continuity,
    primaryEvidenceLane: lane.name,
    burden: frame.burden,
    requiredControls: [
      "Name the exact witness and version.",
      "Separate observation, attribution, interpretation, and inference.",
      "Record the strongest falsifying or disconfirming witness.",
      "Grant no authority beyond the selected continuity and source lane."
    ],
    outputStanding: "review packet only; no automatic canon or graph effect"
  };
  document.querySelector("#packet").textContent = JSON.stringify(packet, null, 2);
});

const lanes = document.querySelector("#lanes");
const renderLanes = (query = "") => {
  lanes.replaceChildren();
  const needle = query.trim().toLowerCase();
  for (const lane of data.sourceLanes) {
    const haystack = JSON.stringify(lane).toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    const card = el("article", "lane");
    const head = el("div", "lane-head");
    head.append(el("h3", "", lane.name), el("span", "rank", String(lane.rank).padStart(2, "0")));
    const chip = el("span", "standing-chip", lane.standing);
    const dl = el("dl");
    dl.append(el("dt", "", "Can establish"), el("dd", "", lane.canEstablish), el("dt", "", "Cannot establish"), el("dd", "", lane.cannotEstablish));
    card.append(head, chip, dl);
    lanes.append(card);
  }
};
renderLanes();
document.querySelector("#lane-search").addEventListener("input", (event) => renderLanes(event.target.value));

const winds = document.querySelector("#winds");
for (const item of data.twowChapters) {
  const card = el("article", "chapter");
  card.append(el("h3", "", item.chapter), el("p", "", `${item.status} · ${item.lane}`));
  winds.append(card);
}
const witnessMetrics = document.querySelector("#witness-metrics");
for (const item of data.witnessMetrics) {
  const card = el("div", "mini-metric");
  card.append(el("strong", "", String(item.value)), document.createTextNode(item.label));
  witnessMetrics.append(card);
}

document.querySelector("#private-hold").textContent = `${data.custody.privateArchiveHold.name}\n${data.custody.privateArchiveHold.bytes.toLocaleString()} bytes\nsha256:${data.custody.privateArchiveHold.sha256}`;
document.querySelector("#public-wave").textContent = `${data.custody.publicWave.name}\nsha256:${data.custody.publicWave.sha256}\nrepository materialized: ${data.custody.publicWave.repositoryMaterialized}`;
