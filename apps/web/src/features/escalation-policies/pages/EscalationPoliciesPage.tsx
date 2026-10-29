import type { EscalationPolicy } from "@im/contracts";
import React, { useMemo, useState } from "react";

import {
  Badge,
  Button,
  CheckboxField,
  Dialog,
  ErrorState,
  Field,
  PageHeader,
  Panel,
  SectionHeader,
  TablePageSkeleton,
  TextInput,
} from "../../../shared/components";
import { useAuth } from "../../../shared/auth";
import { LocalizedText } from "../../../shared/i18n";
import { DelayPresetField } from "../components/DelayPresetField";
import { PolicyList } from "../components/PolicyList";
import { EscalationStepPreview, PolicyDetail, PolicyUsageSummary } from "../components/PolicyPreview";
import { StepEditor } from "../components/StepEditor";
import {
  createBlankPolicyForm,
  createNextStep,
  createScheduleNameMap,
  createServiceCountMap,
  createTeamNameMap,
  createUserNameMap,
  emptyStepValidation,
  formFromPolicy,
  minimumStepDelaySeconds,
  normalizePolicySteps,
  repeatDelayPresets,
  stepsFromPolicy,
  toStepRequest,
  validatePolicyForm,
  type PolicyFormState,
} from "../lib/policy-form";
import {
  useCreateEscalationPolicyMutation,
  useDeleteEscalationPolicyMutation,
  useEscalationPolicyList,
  useEscalationPolicySchedules,
  useEscalationPolicyServices,
  useEscalationPolicyTeams,
  useEscalationPolicyUsers,
  useEscalationPolicyWorkspaceMembers,
  useUpdateEscalationPolicyMutation,
} from "../queries";

const defaultPolicyForm = createBlankPolicyForm();

export function EscalationPoliciesPage() {
  const { projectId } = useAuth();
  const [isEditingPolicy, setIsEditingPolicy] = useState(true);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [policyDialog, setPolicyDialog] = useState<"delete" | "blocked" | null>(null);
  const [form, setForm] = useState<PolicyFormState>(defaultPolicyForm);
  const [savedForm, setSavedForm] = useState<PolicyFormState>(defaultPolicyForm);
  const [pendingSelection, setPendingSelection] = useState<EscalationPolicy | "new" | "cancel" | null>(null);
  const policiesQuery = useEscalationPolicyList();
  const schedulesQuery = useEscalationPolicySchedules();
  const servicesQuery = useEscalationPolicyServices();
  const teamsQuery = useEscalationPolicyTeams();
  const usersQuery = useEscalationPolicyUsers();
  const workspaceMembersQuery = useEscalationPolicyWorkspaceMembers();
  const createPolicyMutation = useCreateEscalationPolicyMutation();
  const deletePolicyMutation = useDeleteEscalationPolicyMutation();
  const updatePolicyMutation = useUpdateEscalationPolicyMutation(selectedPolicyId);

  const policies = policiesQuery.data ?? [];
  const schedules = schedulesQuery.data ?? [];
  const services = servicesQuery.data?.items ?? [];
  const teams = teamsQuery.data ?? [];
  const allUsers = usersQuery.data ?? [];
  const workspaceMemberUserIds = useMemo(
    () => new Set((workspaceMembersQuery.data ?? []).map((member) => member.user_id)),
    [workspaceMembersQuery.data],
  );
  const users = useMemo(
    () => allUsers.filter((user) => workspaceMemberUserIds.has(user.id)),
    [allUsers, workspaceMemberUserIds],
  );
  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) ?? null;
  const scheduleNameById = useMemo(() => createScheduleNameMap(schedules), [schedules]);
  const userNameById = useMemo(() => createUserNameMap(allUsers), [allUsers]);
  const teamNameById = useMemo(() => createTeamNameMap(teams), [teams]);
  const serviceCountByPolicyId = useMemo(() => createServiceCountMap(services), [services]);
  const selectedPolicyServices = useMemo(
    () => services.filter((service) => service.escalation_policy_id === selectedPolicyId),
    [selectedPolicyId, services],
  );
  const detailSteps = selectedPolicy && !isEditingPolicy ? stepsFromPolicy(selectedPolicy) : form.steps;
  const mutationError = createPolicyMutation.error ?? updatePolicyMutation.error ?? deletePolicyMutation.error;
  const isDeleting = deletePolicyMutation.isPending && deletePolicyMutation.variables === selectedPolicyId;
  const isSaving = createPolicyMutation.isPending || updatePolicyMutation.isPending || isDeleting;
  const formValidation = useMemo(() => validatePolicyForm(form, workspaceMemberUserIds), [form, workspaceMemberUserIds]);
  const hasUnsavedChanges = isEditingPolicy && JSON.stringify(form) !== JSON.stringify(savedForm);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPolicyId && !projectId) return;
    if (!formValidation.isValid) return;

    const input = {
      name: form.name.trim(),
      repeat_enabled: form.repeatEnabled,
      repeat_interval_seconds: form.repeatEnabled ? form.repeatIntervalSeconds : null,
      repeat_limit: form.repeatEnabled && form.repeatLimit ? Number(form.repeatLimit) : null,
      steps: normalizePolicySteps(form.steps).map(toStepRequest),
    };

    if (selectedPolicyId) {
      const updatedPolicy = await updatePolicyMutation.mutateAsync(input);
      const nextForm = formFromPolicy(updatedPolicy);
      setForm(nextForm);
      setSavedForm(nextForm);
      setIsEditingPolicy(false);
      return;
    }

    const createdPolicy = await createPolicyMutation.mutateAsync({
      ...input,
      workspace_id: projectId ?? "",
    });
    setSelectedPolicyId(createdPolicy.id);
    const nextForm = formFromPolicy(createdPolicy);
    setForm(nextForm);
    setSavedForm(nextForm);
    setIsEditingPolicy(false);
  }

  function resetForm() {
    const nextForm = createBlankPolicyForm(schedules[0]?.id ?? "");
    setSelectedPolicyId("");
    setForm(nextForm);
    setSavedForm(nextForm);
    setIsEditingPolicy(true);
  }

  function selectPolicy(policy: EscalationPolicy) {
    const nextForm = formFromPolicy(policy);
    setSelectedPolicyId(policy.id);
    setForm(nextForm);
    setSavedForm(nextForm);
    setIsEditingPolicy(false);
  }

  function cancelEdit() {
    if (!selectedPolicy) return;
    const nextForm = formFromPolicy(selectedPolicy);
    setForm(nextForm);
    setSavedForm(nextForm);
    setIsEditingPolicy(false);
  }

  function requestSelection(next: EscalationPolicy | "new" | "cancel") {
    if (hasUnsavedChanges) {
      setPendingSelection(next);
      return;
    }
    applySelection(next);
  }

  function applySelection(next: EscalationPolicy | "new" | "cancel") {
    if (next === "new") resetForm();
    else if (next === "cancel") cancelEdit();
    else selectPolicy(next);
  }

  function handleDeleteSelectedPolicy() {
    if (!selectedPolicy) return;

    if (selectedPolicyServices.length > 0) {
      setPolicyDialog("blocked");
      return;
    }

    setPolicyDialog("delete");
  }

  async function confirmDeleteSelectedPolicy() {
    if (!selectedPolicy) return;

    await deletePolicyMutation.mutateAsync(selectedPolicy.id);
    setPolicyDialog(null);
    resetForm();
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
      <PageHeader
        action={<Button onClick={() => requestSelection("new")} size="sm" variant="secondary">New policy</Button>}
        description="Define who gets notified, when escalation advances, and whether the sequence repeats."
        help="An escalation policy is the response sequence for a service. Each step waits for a delay, notifies a responder, and can continue until someone acknowledges or resolves the incident."
        title="Escalation policies"
      />

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.42fr)_minmax(0,1fr)] min-w-0">
        <Panel className="grid gap-4">
          <SectionHeader
            description="Select a policy to review its steps, repeat rules, and connected services."
            title="Policies"
          />
          {policiesQuery.isLoading ? <TablePageSkeleton label="Loading escalation policies" /> : null}
          {policiesQuery.error ? <ErrorState error={policiesQuery.error} onRetry={() => Promise.all([policiesQuery.refetch(), schedulesQuery.refetch(), servicesQuery.refetch(), teamsQuery.refetch(), usersQuery.refetch(), workspaceMembersQuery.refetch()])} title="Could not load policies" /> : null}
          {servicesQuery.error ? <ErrorState error={servicesQuery.error} onRetry={() => void servicesQuery.refetch()} title="Could not load policy usage" /> : null}
          {!policiesQuery.isLoading && !policiesQuery.error ? (
            <PolicyList
              policies={policies}
              selectedPolicyId={selectedPolicyId}
              serviceCountByPolicyId={serviceCountByPolicyId}
              onSelect={(policy) => requestSelection(policy)}
            />
          ) : null}
        </Panel>

        <Panel>
          <form className="grid gap-4 min-w-0" onSubmit={handleSubmit}>
              <SectionHeader
                action={(
                  <div className="flex flex-wrap gap-2">
                    {selectedPolicy && !isEditingPolicy ? (
                      <Button disabled={isSaving} onClick={() => setIsEditingPolicy(true)} size="sm" variant="secondary">Edit</Button>
                    ) : null}
                    {selectedPolicy ? (
                      <Button
                        disabled={isSaving || selectedPolicyServices.length > 0}
                        isLoading={isDeleting}
                        onClick={handleDeleteSelectedPolicy}
                        size="sm"
                        variant="danger"
                      >
                        Delete
                      </Button>
                    ) : null}
                    {selectedPolicy && isEditingPolicy ? <Button disabled={isSaving} onClick={() => requestSelection("cancel")} size="sm" variant="ghost">Cancel</Button> : null}
                  </div>
                )}
                description={selectedPolicy
                  ? "Review or update the responders and timing used by this policy."
                  : "Start with a name, add at least one responder step, then choose whether the sequence repeats."}
                title={selectedPolicy ? selectedPolicy.name : "New policy"}
              />
              {selectedPolicy ? <PolicyUsageSummary services={selectedPolicyServices} /> : null}
              {schedulesQuery.error ? <ErrorState error={schedulesQuery.error} onRetry={() => void schedulesQuery.refetch()} title="Could not load on-call schedules" /> : null}
              {usersQuery.error ? <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} title="Could not load users" /> : null}
              {workspaceMembersQuery.error ? <ErrorState error={workspaceMembersQuery.error} onRetry={() => void workspaceMembersQuery.refetch()} title="Could not load project members" /> : null}
              {teamsQuery.error ? <ErrorState error={teamsQuery.error} onRetry={() => void teamsQuery.refetch()} title="Could not load teams" /> : null}
              {selectedPolicy && !isEditingPolicy ? (
                <PolicyDetail
                  policy={selectedPolicy}
                  scheduleNameById={scheduleNameById}
                  steps={detailSteps}
                  teamNameById={teamNameById}
                  userNameById={userNameById}
                />
              ) : (
                <>
              <div className="grid gap-3.5">
                <Field label="Name" required>
                  <TextInput
                    disabled={isSaving}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Core platform escalation"
                    required
                    value={form.name}
                  />
                </Field>
              </div>

              <section className="grid gap-3">
                <SectionHeader
                  action={(
                    <Button
                      disabled={isSaving}
                      onClick={() => setForm((current) => ({
                        ...current,
                        steps: [...current.steps, createNextStep(current.steps)],
                      }))}
                      size="sm"
                      variant="ghost"
                    >
                      Add step
                    </Button>
                  )}
                  description="Each step waits for its delay, then notifies the selected user, team, or on-call schedule."
                  title="Escalation steps"
                />
                {form.steps.map((step, index) => (
                  <StepEditor
                    key={step.id ?? step.stepOrder}
                    disabled={isSaving}
                    index={index}
                    onChange={(nextStep) => setForm((current) => ({
                      ...current,
                      steps: normalizePolicySteps(
                        current.steps.map((currentStep, currentIndex) => currentIndex === index ? nextStep : currentStep),
                      ),
                    }))}
                    onRemove={() => setForm((current) => ({
                      ...current,
                      steps: normalizePolicySteps(current.steps.filter((_, currentIndex) => currentIndex !== index)),
                    }))}
                    schedules={schedules}
                    step={step}
                    teams={teams}
                    users={users}
                    validation={formValidation.stepErrors[index] ?? emptyStepValidation}
                  />
                  ))}
              </section>

              <section className="bg-surface-2 border border-hairline rounded-md grid gap-3 p-3">
                <div className="flex items-start gap-3 justify-between">
                  <div className="grid gap-1.25 min-w-0">
                    <span className="text-ink-subtle text-[11px] font-[750] leading-none uppercase">Preview</span>
                    <strong className="text-ink text-sm font-[650] leading-[1.3]">
                      {form.repeatEnabled ? "Repeats until acknowledgement or resolution" : "Stops after the final step"}
                    </strong>
                  </div>
                  <Badge tone={form.repeatEnabled ? "yellow" : "neutral"}>
                    {form.repeatEnabled ? `repeat ${form.repeatLimit || "unlimited"}` : "no repeat"}
                  </Badge>
                </div>
                <EscalationStepPreview
                  scheduleNameById={scheduleNameById}
                  steps={form.steps}
                  teamNameById={teamNameById}
                  userNameById={userNameById}
                />
              </section>

              <section className="bg-surface-2 border border-hairline rounded-md grid gap-3 p-3">
                <SectionHeader
                  description="Use repeat when incidents should continue notifying responders until someone takes ownership."
                  title="Repeat"
                />
                <CheckboxField
                  checked={form.repeatEnabled}
                  description="After the final step, wait and start again from step 1 until ack or resolve."
                  disabled={isSaving}
                  label="Repeat escalation"
                  onChange={(event) => setForm((current) => ({ ...current, repeatEnabled: event.target.checked }))}
                />
                <div className="grid gap-3.5 grid-cols-2">
                  <DelayPresetField
                    disabled={isSaving || !form.repeatEnabled}
                    error={formValidation.repeatError}
                    label="Repeat every"
                    minimumSeconds={minimumStepDelaySeconds}
                    onChange={(seconds) => setForm((current) => ({ ...current, repeatIntervalSeconds: seconds }))}
                    presets={repeatDelayPresets}
                    value={form.repeatIntervalSeconds}
                  />
                  <Field error={formValidation.repeatError} label="Repeat limit">
                    <TextInput
                      aria-invalid={Boolean(formValidation.repeatError)}
                      disabled={isSaving || !form.repeatEnabled}
                      inputMode="numeric"
                      onChange={(event) => setForm((current) => ({ ...current, repeatLimit: event.target.value }))}
                      placeholder="Blank for unlimited"
                      value={form.repeatLimit}
                    />
                  </Field>
                </div>
              </section>

              <div className="flex flex-wrap gap-2.5 justify-end">
                <Button disabled={isSaving || !formValidation.isValid} isLoading={isSaving} type="submit" variant="primary">
                  {selectedPolicy ? "Save policy" : "Create policy"}
                </Button>
              </div>
                </>
              )}
              {mutationError ? <ErrorState error={mutationError} title="Could not save policy" /> : null}
            </form>
          </Panel>
      </section>
      <Dialog
        cancelLabel={policyDialog === "blocked" ? "Close" : "Cancel"}
        confirmLabel="Delete policy"
        description={policyDialog === "blocked"
          ? "This policy is connected to one or more services. Remove it from those services before deleting it."
          : selectedPolicy
            ? `Delete "${selectedPolicy.name}"? Policies with incident history cannot be deleted.`
            : undefined}
        isConfirming={deletePolicyMutation.isPending}
        onClose={() => setPolicyDialog(null)}
        onConfirm={policyDialog === "delete" ? () => void confirmDeleteSelectedPolicy() : undefined}
        open={policyDialog !== null}
        title={policyDialog === "blocked" ? "Policy cannot be deleted" : "Delete policy?"}
        tone="danger"
      />
      <Dialog
        confirmLabel="Discard changes"
        description="Your unsaved policy changes will be lost."
        onClose={() => setPendingSelection(null)}
        onConfirm={() => {
          if (pendingSelection) applySelection(pendingSelection);
          setPendingSelection(null);
        }}
        open={pendingSelection !== null}
        title="Discard unsaved changes?"
        tone="danger"
      />
      </section>
    </LocalizedText>
  );
}
