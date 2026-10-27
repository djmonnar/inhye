"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useAuth, useToast } from "@/components/providers";
import { ConfirmSheet, EmptyState, Field, Loading, PageHeader, Segmented, Sheet } from "@/components/ui";
import { IS_DEMO } from "@/lib/config";
import { relTime } from "@/lib/format";
import { useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import { USERNAME_RE } from "@/lib/supabase";
import type { Member, Role } from "@/lib/types";

const ROLE: Record<Role, { label: string; style: string }> = {
  admin: { label: "관리자", style: "bg-berry-100 text-berry-700" },
  staff: { label: "직원", style: "bg-soda-100 text-soda-700" },
  pending: { label: "승인 대기", style: "bg-butter-100 text-butter-700" },
};

export default function MembersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const { data: members, isLoading } = useQuery({ queryKey: ["members"], queryFn: () => store().listMembers() });
  const [adding, setAdding] = useState(false);
  const [pwFor, setPwFor] = useState<Member | null>(null);
  const [delFor, setDelFor] = useState<Member | null>(null);

  if (user?.role !== "admin") return <EmptyState mood="sad" title="관리자만 볼 수 있어요" />;

  async function setRole(m: Member, role: Role) {
    try {
      await store().updateMember(m.id, { role });
      await refresh("members");
      toast(`${m.display_name}님을 ${ROLE[role].label}(으)로 바꿨어요`, "happy");
    } catch (e) {
      toast(e instanceof Error ? e.message : "바꾸지 못했어요", "sad");
    }
  }

  return (
    <div>
      <PageHeader
        back
        title="직원 계정"
        right={
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)} disabled={IS_DEMO}>
            <UserPlus size={16} /> 추가
          </button>
        }
      />
      {IS_DEMO && (
        <p className="mb-3 rounded-2xl bg-butter-100 p-3 text-sm text-butter-700">
          체험 모드에서는 계정을 만들 수 없어요. Supabase를 연결하면 사용할 수 있어요.
        </p>
      )}
      <div className="mb-3 rounded-2xl bg-white p-3 text-xs text-ink-soft">
        <b className="text-ink">관리자</b>는 모든 기능 + 삭제 · 직원 관리, <b className="text-ink">직원</b>은 상품 등록·수정 · 입고 ·
        스캔까지 할 수 있어요. 직접 가입한 계정은 ‘승인 대기’로 들어오니 승인해 주세요.
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        <ul className="space-y-2">
          {(members ?? []).map((m) => (
            <li key={m.id} className="card p-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-berry-50 font-cute text-lg text-berry-600">
                  {m.display_name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-cute text-lg">
                    {m.display_name} {m.id === user.id && <span className="text-xs text-ink-faint">(나)</span>}
                  </p>
                  <p className="text-xs text-ink-soft">
                    @{m.username} · {relTime(m.created_at)} 가입
                  </p>
                </div>
                <span className={`badge ${ROLE[m.role].style}`}>{ROLE[m.role].label}</span>
              </div>
              {m.id !== user.id && !IS_DEMO && (
                <div className="mt-3 space-y-2">
                  <Segmented<Role>
                    value={m.role}
                    onChange={(r) => void setRole(m, r)}
                    options={[
                      { value: "staff", label: "직원" },
                      { value: "admin", label: "관리자" },
                      { value: "pending", label: "사용 중지" },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="btn-soft btn-sm" onClick={() => setPwFor(m)}>
                      <KeyRound size={16} /> 비밀번호 바꾸기
                    </button>
                    <button type="button" className="btn-danger btn-sm" onClick={() => setDelFor(m)}>
                      <Trash2 size={16} /> 삭제
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddMemberSheet open={adding} onClose={() => setAdding(false)} />
      <PasswordSheet member={pwFor} onClose={() => setPwFor(null)} />
      <ConfirmSheet
        open={delFor !== null}
        onClose={() => setDelFor(null)}
        danger
        title="계정을 삭제할까요?"
        desc={`${delFor?.display_name ?? ""}(@${delFor?.username ?? ""}) 계정으로 더 이상 로그인할 수 없어요. 등록한 상품은 남아요.`}
        confirmText="삭제"
        onConfirm={async () => {
          if (!delFor) return;
          try {
            await store().deleteMember(delFor.id);
            await refresh("members");
            toast("삭제했어요", "sad");
          } catch (e) {
            toast(e instanceof Error ? e.message : "삭제하지 못했어요", "sad");
          }
        }}
      />
    </div>
  );
}

function AddMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [f, setF] = useState({ username: "", password: "", display_name: "", role: "staff" as Role });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const username = f.username.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return setError("아이디는 영어 소문자·숫자로 3~32자예요.");
    if (f.password.length < 6) return setError("비밀번호는 6자 이상이에요.");
    setBusy(true);
    try {
      await store().createMember({ ...f, username, display_name: f.display_name.trim() || username });
      await refresh("members");
      toast("계정을 만들었어요!", "wow");
      setF({ username: "", password: "", display_name: "", role: "staff" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="새 계정">
      <form onSubmit={submit} className="space-y-4">
        <Field label="이름 (화면에 보이는 이름)">
          {(id) => <input id={id} className="input" placeholder="예: 민지" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />}
        </Field>
        <Field label="아이디" hint="영어 소문자·숫자 (로그인할 때 써요)">
          {(id) => (
            <input id={id} className="input" autoCapitalize="none" autoCorrect="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          )}
        </Field>
        <Field label="비밀번호" hint="6자 이상">
          {(id) => <input id={id} className="input" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}
        </Field>
        <Segmented<Role>
          value={f.role}
          onChange={(role) => setF({ ...f, role })}
          options={[
            { value: "staff", label: "직원" },
            { value: "admin", label: "관리자" },
          ]}
        />
        {error && <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "만드는 중..." : "계정 만들기"}
        </button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={member !== null} onClose={onClose} title={`${member?.display_name ?? ""} 비밀번호 바꾸기`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!member) return;
          if (pw.length < 6) {
            toast("비밀번호는 6자 이상이에요", "sad");
            return;
          }
          setBusy(true);
          try {
            await store().updateMember(member.id, { password: pw });
            toast("비밀번호를 바꿨어요", "happy");
            setPw("");
            onClose();
          } catch (err) {
            toast(err instanceof Error ? err.message : "바꾸지 못했어요", "sad");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="새 비밀번호">
          {(id) => <input id={id} className="input" type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          바꾸기
        </button>
      </form>
    </Sheet>
  );
}
