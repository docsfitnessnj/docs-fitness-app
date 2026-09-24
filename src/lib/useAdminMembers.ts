import { useCallback, useEffect, useMemo, useState } from 'react';
import { isBackendUnavailableError, supabase } from './supabaseClient';

export type MemberGroupKey =
  | 'founding'
  | 'monthly_online'
  | 'annual_online'
  | 'monthly_unlimited'
  | 'ten_pack'
  | 'drop_in'
  | 'free';

export type AdminMemberStatusKind = 'trial' | 'active' | 'canceling' | 'canceled' | 'none';

export type AdminMember = {
  id: string;
  displayName: string;
  email: string | null;
  howTrain: 'online' | 'boathouse' | null;
  createdAt: number;
  isAdmin: boolean;
  founding: boolean;
  group: MemberGroupKey;
  statusKind: AdminMemberStatusKind;
  statusLabel: string | null;
};

// The 7 sections Member Manager groups the roster into, in the exact order
// Doc wants them shown, each carrying its own header copy. The three
// in-person groups are flagged `simulated` since there's no real in-person
// billing yet (see profiles.in_person_plan / MembershipContext).
export const MEMBER_GROUPS: { key: MemberGroupKey; title: string; simulated?: boolean }[] = [
  { key: 'founding', title: 'MONTHLY (ONLINE) FOUNDING 50' },
  { key: 'monthly_online', title: 'MONTHLY (ONLINE)' },
  { key: 'annual_online', title: 'ANNUAL (ONLINE)' },
  { key: 'monthly_unlimited', title: 'MONTHLY UNLIMITED (IN PERSON)', simulated: true },
  { key: 'ten_pack', title: '10 CLASS PACK (IN PERSON)', simulated: true },
  { key: 'drop_in', title: 'DROP IN AND GUESTS', simulated: true },
  { key: 'free', title: 'FREE ACCOUNTS' },
];

type Row = {
  id: string;
  display_name: string | null;
  email: string | null;
  how_train: 'online' | 'boathouse' | null;
  in_person_plan: 'monthly_unlimited' | 'ten_pack' | 'drop_in' | null;
  is_admin: boolean;
  created_at: string;
  founding_member: boolean;
  sub_status: string | null;
  sub_plan: 'monthly' | 'annual' | 'founding' | null;
  sub_current_period_end: string | null;
  sub_trial_end: string | null;
  sub_cancel_at_period_end: boolean | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

// The real subscriptions table is the only truth for online plan + status —
// never any simulated/local flag (see supabase/setup.sql's admin_list_members
// and SubscriptionContext). In-person plan grouping still comes from the
// simulated `in_person_plan` column since there's no real in-person billing
// yet. A member only ever lands in exactly one group, so the FOUNDING tag is
// tied 1:1 to `group === 'founding'` rather than the historical
// founding_fifty_members row alone — a founding member whose subscription
// has fully ended moves to FREE ACCOUNTS like any other lapsed member.
function mapRow(row: Row): AdminMember {
  const status = row.sub_status;
  const onlineActive = status === 'trialing' || status === 'active';

  let group: MemberGroupKey;
  let statusKind: AdminMemberStatusKind;
  let statusLabel: string | null = null;

  if (onlineActive) {
    group = row.sub_plan === 'founding' ? 'founding' : row.sub_plan === 'annual' ? 'annual_online' : 'monthly_online';
    if (status === 'trialing') {
      statusKind = 'trial';
      statusLabel = `TRIAL · ENDS ${formatDate(row.sub_trial_end)}`;
    } else if (row.sub_cancel_at_period_end) {
      statusKind = 'canceling';
      statusLabel = `CANCELS ON ${formatDate(row.sub_current_period_end)}`;
    } else {
      statusKind = 'active';
      statusLabel = `ACTIVE · RENEWS ${formatDate(row.sub_current_period_end)}`;
    }
  } else if (row.in_person_plan === 'monthly_unlimited') {
    group = 'monthly_unlimited';
    statusKind = 'active';
  } else if (row.in_person_plan === 'ten_pack') {
    group = 'ten_pack';
    statusKind = 'active';
  } else if (row.in_person_plan === 'drop_in') {
    group = 'drop_in';
    statusKind = 'active';
  } else {
    group = 'free';
    if (status === 'canceled') {
      statusKind = 'canceled';
      statusLabel = `CANCELED${row.sub_current_period_end ? ` · ${formatDate(row.sub_current_period_end)}` : ''}`;
    } else {
      statusKind = 'none';
    }
  }

  return {
    id: row.id,
    displayName: row.display_name?.trim() || 'Member',
    email: row.email,
    howTrain: row.how_train,
    createdAt: new Date(row.created_at).getTime(),
    isAdmin: row.is_admin,
    founding: group === 'founding',
    group,
    statusKind,
    statusLabel,
  };
}

// Doc's Member Manager roster — one RPC call joining profiles, real email,
// Founding 50 membership, and the real Stripe-backed subscriptions row (see
// admin_list_members() in supabase/setup.sql). Returns zero rows for a
// non-admin caller rather than erroring.
export function useAdminMembers(active: boolean) {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('admin_list_members');
    if (rpcError) {
      setError(isBackendUnavailableError(rpcError) ? "Can't load members right now." : rpcError.message);
      return;
    }
    setError(null);
    setMembers(((data ?? []) as Row[]).map(mapRow));
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    refetch().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [active, refetch]);

  const grouped = useMemo(
    () =>
      MEMBER_GROUPS.map((g) => ({
        ...g,
        members: members.filter((m) => m.group === g.key),
      })),
    [members]
  );

  return { members, grouped, loading, error, refetch };
}
