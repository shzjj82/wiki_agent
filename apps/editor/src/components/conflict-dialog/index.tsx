import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import type { EditorJsBlock } from "@myblog/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { mergedBlock, suggestMerges } from "@/lib/document/aiMerge";
import { blockHtml, blockText, highlightHtml } from "@/lib/document/blockView";
import type { BlockConflict, ConflictChoice, MergeResult } from "@/lib/document/merge";
import { diffText, type DiffPart } from "@/lib/document/textDiff";
import type { SaveConflict } from "@/hooks/usePageActions";
import { cn } from "@/lib/utils";

type Props = {
  conflict: SaveConflict | null;
  onResolve: (choices: Record<string, ConflictChoice>, aiBlocks: Record<string, EditorJsBlock>) => void;
};

const MINE_MARK = "rounded-[3px] bg-emerald-100 px-0.5 text-emerald-800 dark:bg-emerald-400/25 dark:text-emerald-100";
const THEIRS_MARK = "rounded-[3px] bg-rose-100 px-0.5 text-rose-800 dark:bg-rose-400/25 dark:text-rose-100";

/**
 * 按钮组件悬停会把文字改成近黑。这里把悬停的背景和文字都写成这一侧自己的颜色，
 * 避免盖掉绿 / 玫瑰 / 琥珀 / 紫。
 */
const CHOICE_BUTTON = {
  emerald: {
    idle: "border-emerald-200! bg-emerald-50! text-emerald-800! hover:border-emerald-300! hover:bg-emerald-100! hover:text-emerald-800!",
    on: "border-emerald-600! bg-emerald-600! text-white! hover:border-emerald-700! hover:bg-emerald-700! hover:text-white!",
  },
  rose: {
    idle: "border-rose-200! bg-rose-50! text-rose-800! hover:border-rose-300! hover:bg-rose-100! hover:text-rose-800!",
    on: "border-rose-600! bg-rose-600! text-white! hover:border-rose-700! hover:bg-rose-700! hover:text-white!",
  },
  amber: {
    idle: "border-amber-200! bg-amber-50! text-amber-800! hover:border-amber-300! hover:bg-amber-100! hover:text-amber-800!",
    on: "border-amber-500! bg-amber-500! text-white! hover:border-amber-600! hover:bg-amber-600! hover:text-white!",
  },
  violet: {
    idle: "border-violet-200! bg-violet-50! text-violet-800! hover:border-violet-300! hover:bg-violet-100! hover:text-violet-800!",
    on: "border-violet-600! bg-violet-600! text-white! hover:border-violet-700! hover:bg-violet-700! hover:text-white!",
  },
} as const;

/** 全部用我的 / 全部用对方的共用一个下拉按钮，选中后套到每一处冲突 */
function BulkChoice({ value, onChange }: { value: "ours" | "theirs"; onChange: (side: "ours" | "theirs") => void }) {
  const { t } = useTranslation();
  const mine = value === "ours";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={mine ? CHOICE_BUTTON.emerald.idle : CHOICE_BUTTON.rose.idle}>
          {mine ? t("collab.useMineAll") : t("collab.useTheirsAll")}
          <ChevronDown size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[80]">
        <DropdownMenuItem onSelect={() => onChange("ours")}>
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {t("collab.useMineAll")}
          {mine ? <Check size={14} className="ml-auto text-emerald-700" /> : <span className="ml-auto size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange("theirs")}>
          <span className="size-1.5 rounded-full bg-rose-500" />
          {t("collab.useTheirsAll")}
          {mine ? <span className="ml-auto size-3.5" /> : <Check size={14} className="ml-auto text-rose-700" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 保存时和其他成员的修改撞上了：左右分栏对比，点一侧即选用，下面附 AI 综合版 */
export function ConflictDialog({ conflict, onResolve }: Props) {
  return (
    <Dialog open={conflict !== null}>
      <DialogContent
        className="grid max-h-[88vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 sm:max-w-4xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest("[data-slot='dropdown-menu-content']")) return;
          event.preventDefault();
        }}
      >
        {conflict ? <ConflictBody key={conflict.latest.updatedAt} conflict={conflict} onResolve={onResolve} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ConflictBody({ conflict, onResolve }: { conflict: SaveConflict; onResolve: Props["onResolve"] }) {
  const { t } = useTranslation();
  const conflicts = conflict.result.conflicts;
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [bulk, setBulk] = useState<"ours" | "theirs">("ours");
  const [previewing, setPreviewing] = useState(false);
  const [suggestions, setSuggestions] = useState<(string | null)[] | null>(null);
  const [aiError, setAiError] = useState(false);

  useEffect(() => {
    if (!previewing || suggestions || aiError) return;
    const controller = new AbortController();
    void suggestMerges(conflicts, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setSuggestions(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAiError(true);
      });
    return () => controller.abort();
  }, [aiError, conflicts, previewing, suggestions]);

  const preview = useMemo(() => buildAiPreview(conflict.result, conflicts, suggestions), [conflict.result, conflicts, suggestions]);
  const choose = (id: string, choice: ConflictChoice) => setChoices((prev) => ({ ...prev, [id]: choice }));
  const pickAll = (choice: "ours" | "theirs") => {
    setBulk(choice);
    setChoices(Object.fromEntries(conflicts.map((item) => [item.id, choice])));
  };

  return (
    <>
      <DialogHeader className="gap-1.5 border-b border-border px-5 py-4">
        <DialogTitle>{previewing ? t("collab.aiPreviewTitle") : t("collab.conflictTitle")}</DialogTitle>
        <DialogDescription>
          {previewing ? t("collab.aiPreviewHint") : t("collab.conflictDescription", { count: conflicts.length })}
        </DialogDescription>
        {previewing ? null : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-emerald-400/80" />
              {t("collab.mine")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-rose-400/80" />
              {t("collab.theirs")}
            </span>
            <span>{t("collab.conflictBothHint")}</span>
          </p>
        )}
      </DialogHeader>
      {previewing ? (
        <AiPreview suggestions={suggestions} aiError={aiError} preview={preview} missingLabel={t("collab.aiPreviewMissing", { count: preview?.missing ?? 0 })} />
      ) : (
        <div className="flex min-h-0 flex-col gap-4 overflow-auto bg-muted/30 px-5 py-4">
          {conflicts.map((item, index) => (
            <ConflictItem
              key={item.id || index}
              index={index + 1}
              conflict={item}
              choice={choices[item.id] ?? "ours"}
              onChoose={(choice) => choose(item.id, choice)}
            />
          ))}
        </div>
      )}
      <DialogFooter className="flex-wrap items-center gap-2 border-t border-border bg-background px-5 py-3 sm:justify-between">
        {previewing ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewing(false)}>
              {t("collab.aiPreviewBack")}
            </Button>
            <Button
              type="button"
              size="sm"
              className={CHOICE_BUTTON.violet.on}
              disabled={!preview}
              onClick={() => preview && onResolve(preview.choices, preview.blocks)}
            >
              {t("collab.aiPreviewApply")}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <BulkChoice value={bulk} onChange={pickAll} />
              <Button type="button" variant="outline" size="sm" className={CHOICE_BUTTON.violet.idle} onClick={() => setPreviewing(true)}>
                <Sparkles size={14} />
                {t("collab.askAi")}
              </Button>
            </div>
            <Button type="button" size="sm" className="border-emerald-700! bg-emerald-700! text-white! hover:border-emerald-800! hover:bg-emerald-800! hover:text-white!" onClick={() => onResolve(choices, {})}>
              {t("collab.apply")}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

type AiPreviewData = {
  choices: Record<string, ConflictChoice>;
  blocks: Record<string, EditorJsBlock>;
  html: { id: string; ai: boolean; html: string }[];
  missing: number;
};

/** 冲突处用 AI 的文本，没建议的仍用我的，拼成整篇正文 */
function buildAiPreview(result: MergeResult, conflicts: BlockConflict[], suggestions: (string | null)[] | null): AiPreviewData | null {
  if (!suggestions) return null;
  const blocks: Record<string, EditorJsBlock> = {};
  const choices: Record<string, ConflictChoice> = {};
  let missing = 0;
  conflicts.forEach((item, index) => {
    const text = suggestions[index];
    if (!text) {
      missing += 1;
      choices[item.id] = "ours";
      return;
    }
    blocks[item.id] = mergedBlock(item, text);
    choices[item.id] = "ai";
  });
  const doc = result.build(choices, "ours", blocks);
  const aiIds = new Set(Object.keys(blocks));
  return {
    choices,
    blocks,
    missing,
    html: doc.blocks.map((block, index) => ({
      id: block.id || String(index),
      ai: Boolean(block.id && aiIds.has(block.id)),
      html: blockHtml(block),
    })),
  };
}

function AiPreview({
  suggestions,
  aiError,
  preview,
  missingLabel,
}: {
  suggestions: (string | null)[] | null;
  aiError: boolean;
  preview: AiPreviewData | null;
  missingLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-0 overflow-auto bg-muted/30 px-5 py-4">
      {!suggestions && !aiError ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Sparkles size={15} className="text-violet-500" />
          {t("collab.aiLoading")}
        </p>
      ) : aiError || !preview ? (
        <p className="py-10 text-sm text-muted-foreground">{t("collab.aiFailed")}</p>
      ) : (
        <div className="mx-auto max-w-2xl">
          {preview.missing > 0 ? <p className="mb-3 text-xs text-muted-foreground">{missingLabel}</p> : null}
          <article className="rounded-xl border border-border bg-background px-6 py-5 shadow-sm">
            {preview.html.map((block) => (
              <div
                key={block.id}
                className={cn("py-1", block.ai && "my-1 rounded-lg bg-violet-500/10 px-3 py-2")}
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            ))}
          </article>
        </div>
      )}
    </div>
  );
}

function ConflictItem({
  index,
  conflict,
  choice,
  onChoose,
}: {
  index: number;
  conflict: BlockConflict;
  choice: ConflictChoice;
  onChoose: (choice: ConflictChoice) => void;
}) {
  const { t } = useTranslation();
  const mine = useMemo(() => (conflict.mine ? { html: blockHtml(conflict.mine), text: blockText(conflict.mine) } : null), [conflict]);
  const theirs = useMemo(() => (conflict.theirs ? { html: blockHtml(conflict.theirs), text: blockText(conflict.theirs) } : null), [conflict]);
  const parts = useMemo(() => diffText(theirs?.text ?? "", mine?.text ?? ""), [mine, theirs]);

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-medium text-amber-800">{index}</span>
        <span className="text-xs text-muted-foreground">{t("collab.conflictIndex", { index })}</span>
      </header>
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <Pane
          label={t("collab.mine")}
          view={mine}
          parts={parts}
          show="add"
          tone={MINE_MARK}
          accent="emerald"
          selected={choice === "ours" || choice === "both"}
          onPick={() => onChoose("ours")}
        />
        <Pane
          label={t("collab.theirs")}
          view={theirs}
          parts={parts}
          show="del"
          tone={THEIRS_MARK}
          accent="rose"
          selected={choice === "theirs" || choice === "both"}
          onPick={() => onChoose("theirs")}
        />
      </div>
      <div className="flex justify-center px-3 pb-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChoose("both")}
          className={choice === "both" ? CHOICE_BUTTON.amber.on : CHOICE_BUTTON.amber.idle}
        >
          {choice === "both" ? <Check size={14} /> : null}
          {t("collab.keepBoth")}
        </Button>
      </div>
    </section>
  );
}

/** 一侧的正文。选中时整栏描边，改动的字按颜色高亮，未选中的一栏保持可读 */
function Pane({
  label,
  view,
  parts,
  show,
  tone,
  accent,
  selected,
  onPick,
  className,
}: {
  label: string;
  view: { html: string; text: string } | null;
  parts: DiffPart[];
  show: "add" | "del";
  tone: string;
  accent: "emerald" | "rose";
  selected: boolean;
  onPick: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const html = view ? highlightHtml(view.html, parts, show, tone) : "";
  return (
    <div
      className={cn(
        "flex min-h-28 min-w-0 flex-col rounded-xl border text-left transition-colors",
        selected && accent === "emerald" && "border-emerald-400 bg-emerald-50",
        selected && accent === "rose" && "border-rose-400 bg-rose-50",
        !selected && "border-border bg-muted/20",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
        <span className={cn("size-1.5 rounded-full", accent === "emerald" ? "bg-emerald-500" : "bg-rose-500")} />
        <span className="text-xs font-medium">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("ml-auto", selected ? CHOICE_BUTTON[accent].on : CHOICE_BUTTON[accent].idle)}
          onClick={onPick}
        >
          {selected ? <Check size={14} /> : null}
          {selected ? t("collab.selected") : t("collab.pick")}
        </Button>
      </span>
      <span className="max-h-64 overflow-auto px-3 pt-1 pb-3 text-sm leading-6 break-words">
        {view === null ? (
          <span className="text-muted-foreground italic">{t("collab.deleted")}</span>
        ) : !view.text.trim() ? (
          <span className="text-muted-foreground italic">{t("collab.nonText")}</span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </span>
    </div>
  );
}
