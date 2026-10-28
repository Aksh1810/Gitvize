"use client";

import { useState } from "react";
import { Boxes, Code2, FileCode2, Folder, GitBranch, MousePointer2, Network, Package, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const FILES = [
    { name: "page.tsx", folder: "app", kind: "Entry point", description: "The page that brings the interface together.", code: 'import { Map } from "@/components/Map";\nimport { getRepository } from "@/lib/github";\n\nexport default async function Page() {\n  const repo = await getRepository();\n  return <Map repository={repo} />;\n}' },
    { name: "Map.tsx", folder: "components", kind: "Component", description: "Turns repository data into an interactive map.", code: 'import { buildGraph } from "@/lib/graph";\n\nexport function Map({ repository }) {\n  const graph = buildGraph(repository);\n  return <GraphCanvas data={graph} />;\n}' },
    { name: "github.ts", folder: "lib", kind: "Data layer", description: "Connects the interface to repository data.", code: 'export async function getRepository() {\n  const response = await fetch(repoUrl);\n  if (!response.ok) {\n    throw new Error("Repository unavailable");\n  }\n  return response.json();\n}' },
];

export default function RepositoryPreview() {
    const [selected, setSelected] = useState(0);
    const file = FILES[selected];
    return <div className="atlas-preview" role="region" aria-label="Local repository demo">
        <div className="atlas-preview-top"><span className="preview-repo"><GitBranch size={16} aria-hidden="true" /> example / repository <span className="preview-branch">main</span></span><span className="preview-demo-label">Local demo · {FILES.length} files</span></div>
        <div className="preview-views" aria-label="Illustrative workspace views">
            <span className="preview-active"><Network size={16} aria-hidden="true" />File Tree</span><span><Boxes size={16} aria-hidden="true" />Architecture</span><span><Users size={16} aria-hidden="true" />Contributors</span><span><GitBranch size={16} aria-hidden="true" />Branches</span><span><Package size={16} aria-hidden="true" />Dependencies</span>
        </div>
        <div className="atlas-preview-body">
            <aside className="preview-sidebar" aria-label="Demo files">
                <div className="preview-panel-heading"><Folder size={16} aria-hidden="true" />Files</div>
                <div className="preview-files">{FILES.map((item, index) => <div className="preview-file-entry" key={item.name}><span className="preview-folder"><Folder size={14} aria-hidden="true" />{item.folder}</span><Button type="button" variant="ghost" aria-pressed={selected === index} onClick={() => setSelected(index)}><FileCode2 size={16} aria-hidden="true" />{item.name}</Button></div>)}</div>
            </aside>
            <div className="preview-map">
                <div className="preview-map-heading"><span>Repository connections</span><span>{FILES.length} files</span></div>
                <div className="preview-map-stage">
                    <svg className="preview-connections" viewBox="0 0 600 360" preserveAspectRatio="none" aria-hidden="true"><path d="M300 90 C300 155 110 150 110 225 M300 90 V225 M300 90 C300 155 490 150 490 225" /></svg>
                    <div className="preview-root"><GitBranch size={20} aria-hidden="true" /><div>repository<span>main branch</span></div></div>
                    <div className="preview-nodes">{FILES.map((item, index) => <button type="button" key={item.name} className="preview-node" aria-label={`${item.folder} ${item.name}`} onClick={() => setSelected(index)} aria-pressed={selected === index}><span><Folder size={16} aria-hidden="true" />{item.folder}</span><strong><FileCode2 size={16} aria-hidden="true" />{item.name}</strong></button>)}</div>
                    <div className="preview-map-hint"><MousePointer2 size={16} aria-hidden="true" />Select a file to inspect its code</div>
                </div>
            </div>
            <aside className="preview-inspector" aria-live="polite" aria-label="Demo file inspector">
                <div className="preview-inspector-title"><Code2 size={16} aria-hidden="true" />File inspector</div>
                <div className="preview-inspector-content"><p className="preview-file-path">{file.folder}/{file.name}</p><span className="preview-file-kind">{file.kind}</span><h3>{file.name}</h3><p className="preview-description">{file.description}</p><pre tabIndex={0} aria-label={`${file.name} illustrative code`}><code>{file.code}</code></pre><div className="preview-inspector-footer">Illustrative code preview</div></div>
            </aside>
        </div>
    </div>;
}
