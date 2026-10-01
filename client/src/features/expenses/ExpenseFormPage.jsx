import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ArrowDownIcon, ArrowUpIcon, LockIcon } from 'lucide-react';
import {
  bpToPercentString,
  computeShares,
  paiseToRupeesString,
  percentToBp,
  rupeesToPaise,
  splitSummary,
  todayIST,
} from '@splitbook/shared';
import { expensesApi } from '@/api/endpoints.js';
import { withConfirmation } from '@/api/confirm.js';
import { errorMessage } from '@/api/messages.js';
import { useRequest } from '@/hooks/useRequest.js';
import { useConfirm } from '@/components/ConfirmProvider.jsx';
import { DateField, ErrorState, LoadingRows, Money, PageHeader } from '@/components/common.jsx';
import { formatPaise, memberLabel } from '@/lib/format.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '../auth/AuthLayout.jsx';
import { useGroup } from '../groups/GroupContext.jsx';

const METHODS = [
  ['equal', 'Equal'],
  ['exact', 'Exact amounts'],
  ['percentage', 'Percentage'],
];

/** WIREFRAMES §8 — add (E2) and edit (E4) on one full page (UI-3). */
export function ExpenseFormPage() {
  const { expenseId } = useParams();
  const { group } = useGroup();
  const editing = expenseId !== undefined;
  const {
    data: expense,
    error,
    loading,
    refetch,
  } = useRequest(
    (opts) => expensesApi.get(group.groupId, expenseId, opts),
    [group.groupId, expenseId],
    { enabled: editing },
  );

  if (editing && error) return <ErrorState error={error} onRetry={refetch} />;
  if (editing && (loading || !expense)) return <LoadingRows rows={8} />;
  return <ExpenseForm key={expenseId ?? 'new'} group={group} expense={editing ? expense : null} />;
}

/** Form defaults: every active member is a row; current participants first, in order. */
function initialValues(group, me, expense) {
  const active = group.members;
  if (!expense) {
    return {
      description: '',
      amount: '',
      expenseDate: todayIST(),
      payerMembershipId: String(me.membershipId),
      splitMethod: 'equal',
      notes: '',
      rows: active.map((m) => ({ membershipId: m.membershipId, checked: true, value: '' })),
    };
  }
  const byMember = new Map(expense.shares.map((s) => [s.member.membershipId, s]));
  const ordered = [
    ...expense.shares.map((s) => s.member.membershipId),
    ...active.map((m) => m.membershipId).filter((id) => !byMember.has(id)),
  ];
  return {
    description: expense.description,
    amount: paiseToRupeesString(expense.amountPaise),
    expenseDate: expense.expenseDate,
    payerMembershipId: String(expense.payer.membershipId),
    splitMethod: expense.splitMethod,
    notes: expense.notes ?? '',
    rows: ordered.map((membershipId) => {
      const share = byMember.get(membershipId);
      let value = '';
      if (share?.inputPaise) value = paiseToRupeesString(share.inputPaise);
      if (share?.inputBp) value = bpToPercentString(share.inputBp);
      return { membershipId, checked: Boolean(share), value };
    }),
  };
}

/** Form values → API body (E2/E4). Unparseable values become 0 (and get flagged). */
function toBody(values) {
  const participants = values.rows
    .filter((r) => r.checked)
    .map((r) => {
      if (values.splitMethod === 'exact')
        return { membershipId: r.membershipId, valuePaise: rupeesToPaise(r.value) ?? 0 };
      if (values.splitMethod === 'percentage')
        return { membershipId: r.membershipId, valueBp: percentToBp(r.value) ?? 0 };
      return { membershipId: r.membershipId };
    });
  return {
    description: values.description,
    notes: values.notes,
    amountPaise: rupeesToPaise(values.amount) ?? 0,
    expenseDate: values.expenseDate,
    payerMembershipId: Number(values.payerMembershipId),
    splitMethod: values.splitMethod,
    participants,
  };
}

const SERVER_FIELD = {
  amountPaise: 'amount',
  description: 'description',
  notes: 'notes',
  expenseDate: 'expenseDate',
};

function ExpenseForm({ group, expense }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { refetchGroup } = useGroup();
  const me = group.me;
  const editing = expense !== null;
  const frozen = editing && !expense.permissions.canEdit;
  const [formError, setFormError] = useState(null);
  const members = useMemo(
    () => new Map(group.members.map((m) => [m.membershipId, m])),
    [group.members],
  );
  // Past members can appear on an old expense's rows; label them from the expense itself.
  const labelOf = (id) =>
    members.get(id)?.name ??
    memberLabel(expense?.shares.find((s) => s.member.membershipId === id)?.member);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: initialValues(group, me, expense) });
  const { fields, move } = useFieldArray({ control, name: 'rows' });
  const values = useWatch({ control });

  const body = toBody({ ...initialValues(group, me, expense), ...values, rows: values.rows ?? [] });
  const preview = computeShares(body);
  const summary = splitSummary({ ...body, participants: body.participants });
  const shareOf = new Map(
    preview.ok ? preview.shares.map((s) => [s.membershipId, s.sharePaise]) : [],
  );
  const amountOk = body.amountPaise > 0;
  const splitOk =
    body.participants.length > 0 &&
    (body.splitMethod === 'equal' ||
      (body.splitMethod === 'exact' ? summary.remainingPaise === 0 : summary.remainingBp === 0));

  const onSubmit = async (formValues) => {
    setFormError(null);
    const payload = toBody(formValues);
    try {
      const result = await withConfirmation(
        (confirmed) =>
          editing
            ? expensesApi.update(group.groupId, expense.expenseId, {
                ...payload,
                confirm: confirmed,
              })
            : expensesApi.create(group.groupId, { ...payload, confirm: confirmed }),
        (err) =>
          confirm({
            title: 'Balances will change',
            description: `⚠ ${err.details?.settlementCount ?? 'Some'} payment(s) were recorded between these people after this expense was added. Editing it will change balances and may reopen settled amounts.`,
            confirmLabel: 'Save anyway',
          }),
      );
      if (!result.done) return;
      toast.success('Expense saved');
      refetchGroup();
      navigate(`/groups/${group.groupId}/expenses/${result.result.expenseId}`, {
        replace: editing,
      });
    } catch (err) {
      const mapped = Object.entries(err.fieldErrors ?? {}).filter(([field]) => SERVER_FIELD[field]);
      for (const [field, message] of mapped) setError(SERVER_FIELD[field], { message });
      if (mapped.length === 0) setFormError(err);
    }
  };

  const unit = body.splitMethod === 'percentage' ? '%' : '₹';

  return (
    <form className="max-w-4xl space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        title={editing ? 'Edit expense' : 'Add expense'}
        back={{ to: `/groups/${group.groupId}/expenses`, label: group.name }}
      />
      {frozen && (
        <Alert variant="destructive">
          <AlertDescription>
            {expense.permissions.frozenReason === 'INVOLVES_DEPARTED_MEMBER'
              ? "This expense can't be changed because someone involved has left the group."
              : "You can't edit this expense."}
          </AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(formError)}</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={frozen} className="space-y-6">
        <div className="grid grid-cols-[2fr_1fr] gap-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              maxLength={100}
              aria-invalid={!!errors.description}
              {...register('description', { required: 'Required' })}
            />
            <div className="flex justify-between text-xs">
              <FieldError message={errors.description?.message} />
              <span className="ml-auto text-muted-foreground">
                {(values.description ?? '').length}/100
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹) *</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={!!errors.amount}
              {...register('amount', {
                validate: (v) =>
                  (rupeesToPaise(v) ?? 0) > 0 || 'Enter an amount greater than 0 (max 2 decimals)',
              })}
            />
            <FieldError message={errors.amount?.message} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expenseDate">Date *</Label>
            <Controller
              control={control}
              name="expenseDate"
              render={({ field }) => (
                <DateField
                  id="expenseDate"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.expenseDate}
                />
              )}
            />
            <FieldError message={errors.expenseDate?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payer">Paid by *</Label>
            <Controller
              control={control}
              name="payerMembershipId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={frozen}>
                  <SelectTrigger id="payer" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {group.members.map((m) => (
                      <SelectItem key={m.membershipId} value={String(m.membershipId)}>
                        {m.name}
                        {m.membershipId === me.membershipId ? ' (you)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Split method *</Label>
          <Controller
            control={control}
            name="splitMethod"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex gap-6"
                disabled={editing}
                aria-label="Split method"
              >
                {METHODS.map(([value, label]) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`method-${value}`} />
                    <Label htmlFor={`method-${value}`}>{label}</Label>
                  </div>
                ))}
                {editing && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <LockIcon className="size-3" /> Split method can&apos;t be changed
                  </span>
                )}
              </RadioGroup>
            )}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Split between *</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => fields.forEach((_, i) => setValue(`rows.${i}.checked`, true))}
              >
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => fields.forEach((_, i) => setValue(`rows.${i}.checked`, false))}
              >
                Clear
              </Button>
            </div>
          </div>
          <ul className="divide-y rounded-md border">
            {fields.map((field, index) => {
              const row = values.rows?.[index] ?? field;
              const share = shareOf.get(field.membershipId);
              const isActive = members.has(field.membershipId);
              return (
                <li key={field.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Move ${labelOf(field.membershipId)} up`}
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      className="text-muted-foreground disabled:opacity-30"
                    >
                      <ArrowUpIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${labelOf(field.membershipId)} down`}
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                      className="text-muted-foreground disabled:opacity-30"
                    >
                      <ArrowDownIcon className="size-3" />
                    </button>
                  </div>
                  <Controller
                    control={control}
                    name={`rows.${index}.checked`}
                    render={({ field: f }) => (
                      <Checkbox
                        id={`row-${field.membershipId}`}
                        checked={f.value}
                        disabled={!isActive}
                        onCheckedChange={(checked) => f.onChange(checked === true)}
                      />
                    )}
                  />
                  <Label htmlFor={`row-${field.membershipId}`} className="w-48 font-normal">
                    {labelOf(field.membershipId)}
                    {field.membershipId === me.membershipId && ' (you)'}
                  </Label>
                  {body.splitMethod !== 'equal' && (
                    <div className="flex items-center gap-1">
                      <Input
                        className="w-28"
                        inputMode="decimal"
                        aria-label={`${unit === '%' ? 'Percent' : 'Amount'} for ${labelOf(field.membershipId)}`}
                        disabled={!row.checked}
                        {...register(`rows.${index}.value`, {
                          // FR-SPL-04: 0 means not a participant.
                          onBlur: (e) => {
                            const parsed =
                              unit === '%'
                                ? percentToBp(e.target.value)
                                : rupeesToPaise(e.target.value);
                            if (parsed === 0) setValue(`rows.${index}.checked`, false);
                          },
                        })}
                      />
                      <span className="text-muted-foreground">{unit}</span>
                    </div>
                  )}
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {row.checked && share !== undefined ? `→ ${formatPaise(share)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          <SplitStatus
            body={body}
            summary={summary}
            preview={preview}
            amountOk={amountOk}
            labelOf={labelOf}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={2} maxLength={500} {...register('notes')} />
          <div className="text-right text-xs text-muted-foreground">
            {(values.notes ?? '').length}/500
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={frozen || isSubmitting || !amountOk || !splitOk || !values.description?.trim()}
        >
          Save expense
        </Button>
      </div>
    </form>
  );
}

/** Live feedback under the split rows (FR-SPL-06). */
function SplitStatus({ body, summary, preview, amountOk, labelOf }) {
  if (body.participants.length === 0) {
    return <p className="text-sm text-destructive">⚠ Choose at least one person to split with</p>;
  }
  if (!amountOk) return null;
  const payerOnly =
    body.participants.length === 1 && body.participants[0].membershipId === body.payerMembershipId;

  if (body.splitMethod === 'equal') {
    return (
      <div className="text-sm text-muted-foreground">
        <Money paise={body.amountPaise} /> ÷ {body.participants.length} ={' '}
        <Money paise={summary.perHeadPaise} /> each
        {summary.remainderPaise > 0 && (
          <>
            {' '}
            · {labelOf(summary.absorberMembershipId)} pays <Money paise={summary.remainderPaise} />{' '}
            extra
          </>
        )}
        {payerOnly && <p>This only counts in your spending.</p>}
        {!preview.ok && (
          <p className="text-destructive">⚠ {Object.values(preview.fieldErrors ?? {})[0]}</p>
        )}
      </div>
    );
  }
  if (body.splitMethod === 'exact') {
    const left = summary.remainingPaise;
    if (left === 0)
      return (
        <p className="text-sm text-owed">
          ✅ <Money paise={body.amountPaise} /> assigned
        </p>
      );
    return (
      <p className="text-sm text-destructive">
        ⚠ <Money paise={Math.abs(left)} /> {left > 0 ? 'left to assign' : 'over the total'}
      </p>
    );
  }
  const left = summary.remainingBp;
  if (left === 0) {
    return (
      <p className="text-sm text-owed">
        ✅ 100.00% assigned
        {!preview.ok && (
          <span className="text-destructive">
            {' '}
            · ⚠ {Object.values(preview.fieldErrors ?? {})[0]}
          </span>
        )}
      </p>
    );
  }
  return (
    <p className="text-sm text-destructive">
      ⚠ {bpToPercentString(Math.abs(left))}% {left > 0 ? 'left to assign' : 'over 100%'}
    </p>
  );
}
