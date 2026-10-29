import type { User, UserNotificationChannelPreference, WorkspaceInvite } from "@im/contracts";
import React, { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../../shared/auth";
import {
  Badge,
  Button,
  CheckboxField,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  MetricCard,
  NumberInput,
  PageHeader,
  Panel,
  StateBlock,
  TabButton,
  TablePageSkeleton,
  TextInput,
  type DataTableColumn,
} from "../../../shared/components";
import { LanguageSelect, LocalizedText } from "../../../shared/i18n";
import { formatDateTime } from "../../../shared/utils";
import {
  useAcceptInviteMutation,
  useAuthMe,
  useCheckPhoneVerificationMutation,
  useDeclineInviteMutation,
  useMyWorkspaceInvites,
  useMyWorkspaces,
  useResendEmailVerificationMutation,
  useSettingsUsers,
  useStartPhoneVerificationMutation,
  useUpdateUserNotificationPreferencesMutation,
} from "../queries";

const preferenceChannels = ["email", "sms", "phone"] as const;

type PreferenceChannel = UserNotificationChannelPreference["channel"];

type PreferenceFormState = {
  preferences: UserNotificationChannelPreference[];
  smsPhoneNumber: string;
  voicePhoneNumber: string;
};

type PhoneVerificationChannel = "call" | "sms";
type UserSettingsTab = "notifications" | "email" | "phone" | "preferences" | "invitations";

const channelDetails: Record<PreferenceChannel, {
  description: string;
  title: string;
}> = {
  email: {
    description: "Sends a responder email to the signed-in account address.",
    title: "Email",
  },
  phone: {
    description: "Places a voice call when escalation reaches this route.",
    title: "Phone call",
  },
  sms: {
    description: "Sends an SMS to the verified phone number.",
    title: "SMS",
  },
};

export function UserSettingsPage() {
  const { projectId, userId } = useAuth();
  const [activeTab, setActiveTab] = useState<UserSettingsTab>("notifications");
  const [verificationCodes, setVerificationCodes] = useState<Record<PhoneVerificationChannel, string>>({
    call: "",
    sms: "",
  });
  const [verificationPanelOpen, setVerificationPanelOpen] = useState<Record<PhoneVerificationChannel, boolean>>({
    call: false,
    sms: false,
  });
  const [pendingDeleteChannel, setPendingDeleteChannel] = useState<PhoneVerificationChannel | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [preferenceForm, setPreferenceForm] = useState<PreferenceFormState>({
    preferences: preferenceChannels.map((channel) => ({
      channel,
      delay_seconds: 0,
      enabled: false,
    })),
    smsPhoneNumber: "",
    voicePhoneNumber: "",
  });

  const authMeQuery = useAuthMe();
  const usersQuery = useSettingsUsers();
  const workspacesQuery = useMyWorkspaces();
  const myInvitesQuery = useMyWorkspaceInvites();

  const users = usersQuery.data ?? [];
  const workspaces = workspacesQuery.data ?? [];
  const myInvites = myInvitesQuery.data ?? [];
  const currentUser = users.find((user) => user.id === userId) ?? null;
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === projectId) ?? workspaces[0] ?? null;
  const pendingInvites = myInvites.filter((invite) => invite.status === "pending");

  const updatePreferencesMutation = useUpdateUserNotificationPreferencesMutation(currentUser?.id ?? "");
  const resendEmailVerificationMutation = useResendEmailVerificationMutation();
  const startPhoneVerificationMutation = useStartPhoneVerificationMutation(currentUser?.id ?? "");
  const checkPhoneVerificationMutation = useCheckPhoneVerificationMutation(currentUser?.id ?? "");
  const acceptInviteMutation = useAcceptInviteMutation();
  const declineInviteMutation = useDeclineInviteMutation();

  const inviteColumns = useMemo<Array<DataTableColumn<WorkspaceInvite>>>(
    () =>
      createInviteColumns({
        acceptingId: acceptInviteMutation.variables,
        decliningId: declineInviteMutation.variables,
        isAccepting: acceptInviteMutation.isPending,
        isDeclining: declineInviteMutation.isPending,
        onAccept: (invite) => acceptInviteMutation.mutate(invite.id),
        onDecline: (invite) => declineInviteMutation.mutate(invite.id),
      }),
    [acceptInviteMutation, declineInviteMutation],
  );

  const isSmsVerified = currentUser?.notification_settings.contacts.sms_verified ?? false;
  const isVoiceVerified = currentUser?.notification_settings.contacts.voice_verified ?? false;
  const hasSmsPhoneNumber = currentUser?.notification_settings.contacts.has_sms_phone_number ?? false;
  const hasVoicePhoneNumber = currentUser?.notification_settings.contacts.has_voice_phone_number ?? false;
  const verifiedPhoneChannels = Number(isSmsVerified) + Number(isVoiceVerified);
  const arePhoneChannelsVerified = isSmsVerified && isVoiceVerified;
  const phoneVerificationStartError = formatPhoneVerificationStartError(startPhoneVerificationMutation.error);
  const enabledChannels = preferenceForm.preferences.filter((preference) =>
    preference.enabled && isPreferenceChannelReady(preference.channel),
  ).length;

  useEffect(() => {
    if (!currentUser) return;
    setPreferenceForm({
      preferences: preferenceChannels.map((channel) => {
        const preference = currentUser.notification_settings.preferences.find((item) => item.channel === channel);

        return {
          channel,
          delay_seconds: preference?.delay_seconds ?? 0,
          enabled: preference?.enabled ?? false,
        };
      }),
      smsPhoneNumber: "",
      voicePhoneNumber: "",
    });
  }, [currentUser]);

  useEffect(() => {
    setVerificationPanelOpen((current) => {
      const next = {
        call: isVoiceVerified ? false : current.call,
        sms: isSmsVerified ? false : current.sms,
      };

      return next.call === current.call && next.sms === current.sms ? current : next;
    });
    setVerificationCodes((current) => {
      const next = {
        call: isVoiceVerified ? "" : current.call,
        sms: isSmsVerified ? "" : current.sms,
      };

      return next.call === current.call && next.sms === current.sms ? current : next;
    });
  }, [isSmsVerified, isVoiceVerified]);

  function isPreferenceChannelReady(channel: UserNotificationChannelPreference["channel"]) {
    if (!currentUser) return false;

    if (channel === "sms") {
      return isSmsVerified;
    }

    if (channel === "phone") {
      return isVoiceVerified;
    }

    return Boolean(currentUser.email);
  }

  function updatePreference(
    channel: UserNotificationChannelPreference["channel"],
    patch: Partial<UserNotificationChannelPreference>,
  ) {
    setPreferenceForm((current) => ({
      ...current,
      preferences: current.preferences.map((preference) =>
        preference.channel === channel ? { ...preference, ...patch } : preference,
      ),
    }));
  }

  async function handleUpdatePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updatePreferencesMutation.mutateAsync({
        preferences: preferenceForm.preferences.map((preference) => ({
          ...preference,
          enabled: preference.enabled && isPreferenceChannelReady(preference.channel),
        })),
      });
      setSettingsNotice("Notification preferences saved.");
    } catch {
      setSettingsNotice(null);
    }
  }

  async function handleSaveChannelPhoneNumber(channel: PhoneVerificationChannel) {
    const field = channel === "sms" ? "smsPhoneNumber" : "voicePhoneNumber";
    const phoneNumber = preferenceForm[field].trim();
    if (!phoneNumber) return;

    try {
      await updatePreferencesMutation.mutateAsync({
        [channel === "sms" ? "sms_phone_number" : "voice_phone_number"]: phoneNumber,
      });
      setPreferenceForm((current) => ({ ...current, [field]: "" }));
      setVerificationPanelOpen((current) => ({ ...current, [channel]: false }));
      setVerificationCodes((current) => ({ ...current, [channel]: "" }));
      setSettingsNotice(`${channel === "sms" ? "SMS" : "Voice call"} number saved.`);
    } catch {
      // React Query exposes the mutation error below the phone cards.
    }
  }

  function updateVerificationCode(channel: PhoneVerificationChannel, value: string) {
    setVerificationCodes((current) => ({ ...current, [channel]: value }));
  }

  function closePhoneVerificationPanel(channel: PhoneVerificationChannel) {
    setVerificationCodes((current) => ({ ...current, [channel]: "" }));
    setVerificationPanelOpen((current) => ({ ...current, [channel]: false }));
  }

  async function startPhoneVerification(channel: PhoneVerificationChannel) {
    setVerificationPanelOpen((current) => ({ ...current, [channel]: true }));
    try {
      await startPhoneVerificationMutation.mutateAsync({
        channel,
        ...(selectedWorkspace ? { workspace_id: selectedWorkspace.id } : {}),
      });
    } catch {
      // React Query exposes the mutation error below the phone cards.
    }
  }

  async function checkPhoneVerification(channel: PhoneVerificationChannel) {
    const code = verificationCodes[channel].trim();
    if (!code) return;

    try {
      await checkPhoneVerificationMutation.mutateAsync({
        channel,
        code,
        ...(selectedWorkspace ? { workspace_id: selectedWorkspace.id } : {}),
      });
      setVerificationCodes((current) => ({ ...current, [channel]: "" }));
      setVerificationPanelOpen((current) => ({ ...current, [channel]: false }));
    } catch {
      // React Query exposes the mutation error below the phone cards.
    }
  }

  async function clearPhoneVerification(channel: PhoneVerificationChannel) {
    try {
      await updatePreferencesMutation.mutateAsync(channel === "sms"
        ? { sms_verified: false }
        : { voice_verified: false });
      setVerificationCodes((current) => ({ ...current, [channel]: "" }));
      setVerificationPanelOpen((current) => ({ ...current, [channel]: false }));
    } catch {
      // React Query exposes the mutation error below the phone cards.
    }
  }

  async function deletePhoneNumber(channel: PhoneVerificationChannel) {
    try {
      await updatePreferencesMutation.mutateAsync(channel === "sms"
        ? { sms_phone_number: null }
        : { voice_phone_number: null });
      setVerificationCodes((current) => ({ ...current, [channel]: "" }));
      setVerificationPanelOpen((current) => ({ ...current, [channel]: false }));
      setPendingDeleteChannel(null);
      setSettingsNotice(`${channel === "sms" ? "SMS" : "Voice call"} number deleted.`);
    } catch {
      // React Query exposes the mutation error below the phone cards.
    }
  }

  return (
    <LocalizedText>
      <section className="grid gap-4">
      <PageHeader
        description="Manage your notification preferences, phone verification, and project invitations."
        help="Use Email and Phone to verify where alerts can be delivered, Notifications to choose active routes, Preferences to change your language, and Invitations to manage project access."
        title="User settings"
      />

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          caption={currentUser?.email ?? "Signed-in account"}
          label="Account"
          value={currentUser?.name ?? "-"}
        />
        <MetricCard
          caption="SMS and voice call verification"
          label="Phone channels"
          tone={arePhoneChannelsVerified ? "green" : "yellow"}
          value={`${verifiedPhoneChannels}/2`}
        />
        <MetricCard
          caption="Enabled notification channels"
          label="Channels"
          tone="blue"
          value={enabledChannels}
        />
        <MetricCard
          caption="Pending for this account"
          label="Invites"
          tone={pendingInvites.length > 0 ? "yellow" : "green"}
          value={pendingInvites.length}
        />
        <MetricCard
          caption="Cookie session"
          label="Auth method"
          tone="green"
          value={authMeQuery.data?.auth_source ?? "-"}
        />
      </div>

      {usersQuery.error ? <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} title="Could not load account" /> : null}
      {workspacesQuery.error ? <ErrorState error={workspacesQuery.error} onRetry={() => void workspacesQuery.refetch()} title="Could not load workspaces" /> : null}
      {myInvitesQuery.error ? <ErrorState error={myInvitesQuery.error} onRetry={() => void myInvitesQuery.refetch()} title="Could not load invitations" /> : null}

      <Panel className="grid gap-4.5">
        <div aria-label="User settings sections" className="flex items-center gap-1 border-b border-hairline-soft pb-2.5 overflow-x-auto" role="tablist">
          <TabButton active={activeTab === "notifications"} id="user-settings-tab-notifications" label="Notifications" onClick={() => setActiveTab("notifications")} panelId="user-settings-panel-notifications" />
          <TabButton active={activeTab === "email"} id="user-settings-tab-email" label="Email" onClick={() => setActiveTab("email")} panelId="user-settings-panel-email" />
          <TabButton active={activeTab === "phone"} id="user-settings-tab-phone" label="Phone" onClick={() => setActiveTab("phone")} panelId="user-settings-panel-phone" />
          <TabButton active={activeTab === "preferences"} id="user-settings-tab-preferences" label="Preferences" onClick={() => setActiveTab("preferences")} panelId="user-settings-panel-preferences" />
          <TabButton active={activeTab === "invitations"} count={pendingInvites.length} id="user-settings-tab-invitations" label="Invitations" onClick={() => setActiveTab("invitations")} panelId="user-settings-panel-invitations" />
        </div>

        <div className="rounded-lg border border-hairline-soft bg-surface-2/45 px-3.5 py-3 text-ink-muted text-xs leading-[1.45]">
          {activeTab === "notifications"
            ? "Choose which verified routes can receive incident notifications and how long each route should wait."
            : activeTab === "email"
              ? "Verify your account email before relying on email delivery for incident response."
              : activeTab === "phone"
                ? "Save a phone number, verify it, then enable SMS or voice delivery from Notifications."
                : activeTab === "preferences"
                  ? "Choose the language used by navigation, settings, labels, and system UI."
                  : "Accept or decline project invitations associated with your account."}
        </div>

        {activeTab === "email" ? (
          <div aria-labelledby="user-settings-tab-email" className="grid gap-4 min-w-0" id="user-settings-panel-email" role="tabpanel">
            {usersQuery.isLoading ? (
              <LoadingState message="Loading account..." />
            ) : currentUser ? (
              <>
                <section className="grid gap-3.5 rounded-lg border border-hairline-soft bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1 min-w-0">
                      <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Email address</h3>
                      <p className="text-ink-muted text-xs leading-[1.4] m-0">
                        Responder email notifications are sent to the account email address.
                      </p>
                    </div>
                    <Badge tone={currentUser.email_verified ? "green" : "yellow"}>
                      {currentUser.email_verified ? "verified" : "unverified"}
                    </Badge>
                  </div>
                  <NotificationContactRow
                    label="Account email"
                    status={currentUser.email_verified ? "verified" : "unverified"}
                    value={currentUser.email}
                  />
                  <div className="flex justify-end">
                    <Button
                      disabled={currentUser.email_verified}
                      isLoading={resendEmailVerificationMutation.isPending}
                      onClick={() => resendEmailVerificationMutation.mutate({ email: currentUser.email })}
                      type="button"
                      variant={currentUser.email_verified ? "ghost" : "secondary"}
                    >
                      {currentUser.email_verified ? "Email verified" : "Send verification email"}
                    </Button>
                  </div>
                </section>
                {resendEmailVerificationMutation.error ? (
                  <ErrorState error={resendEmailVerificationMutation.error} title="Could not send verification email" />
                ) : null}
              </>
            ) : (
              <EmptyState message="The signed-in user could not be found." title="No account" />
            )}
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <div aria-labelledby="user-settings-tab-notifications" className="grid gap-4 min-w-0" id="user-settings-panel-notifications" role="tabpanel">
            <form className="grid gap-4" onSubmit={handleUpdatePreferences}>
              {usersQuery.isLoading ? (
                <LoadingState message="Loading account..." />
              ) : currentUser ? (
                <>
                  <section className="grid gap-3.5 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1 min-w-0">
                        <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Delivery routes</h3>
                        <p className="text-ink-muted text-xs leading-[1.4] m-0">Enable the personal routes that should receive incident notifications.</p>
                      </div>
                      <Badge tone={enabledChannels > 0 ? "green" : "neutral"}>{enabledChannels} active</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {preferenceForm.preferences.map((preference) => {
                        const isReady = isPreferenceChannelReady(preference.channel);

                        return (
                          <NotificationChannelCard
                            disabled={updatePreferencesMutation.isPending}
                            isReady={isReady}
                            key={preference.channel}
                            onChange={(patch) => updatePreference(preference.channel, patch)}
                            preference={preference}
                            readinessMessage={formatChannelReadiness(preference.channel, currentUser, preferenceForm, {
                              sms: isSmsVerified,
                              voice: isVoiceVerified,
                            })}
                          />
                        );
                      })}
                    </div>
                  </section>
                  {updatePreferencesMutation.error ? (
                    <ErrorState error={updatePreferencesMutation.error} title="Could not save notification settings" />
                  ) : null}
                  {settingsNotice ? <div aria-live="polite" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs text-[#72e09c]" role="status">{settingsNotice}</div> : null}
                  <div className="flex flex-wrap gap-2.5 justify-end">
                    <Button isLoading={updatePreferencesMutation.isPending} type="submit" variant="primary">
                      Save preferences
                    </Button>
                  </div>
                </>
              ) : (
                <EmptyState message="The signed-in user could not be found." title="No account" />
              )}
            </form>
          </div>
        ) : null}

        {activeTab === "phone" ? (
          <div aria-labelledby="user-settings-tab-phone" className="grid gap-4 min-w-0" id="user-settings-panel-phone" role="tabpanel">
            {usersQuery.isLoading ? (
              <LoadingState message="Loading account..." />
            ) : currentUser ? (
              <>
                <section className="grid gap-3.5">
                  <div className="grid gap-1">
                    <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Phone delivery contacts</h3>
                    <p className="text-ink-muted text-xs leading-[1.4] m-0">
                      SMS and voice call can use different phone numbers. Save and verify each route separately.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <PhoneVerificationCard
                      code={verificationCodes.sms}
                      codeLabel="Text message code"
                      currentPhoneNumber={currentUser.notification_settings.contacts.sms_phone_number ?? "not configured"}
                      disabled={!hasSmsPhoneNumber}
                      isDeletingNumber={updatePreferencesMutation.isPending && updatePreferencesMutation.variables?.sms_phone_number === null}
                      isSavingNumber={updatePreferencesMutation.isPending && typeof updatePreferencesMutation.variables?.sms_phone_number === "string"}
                      isClearingVerification={updatePreferencesMutation.isPending && updatePreferencesMutation.variables?.sms_verified === false}
                      isChecking={checkPhoneVerificationMutation.isPending && checkPhoneVerificationMutation.variables?.channel === "sms"}
                      isSending={startPhoneVerificationMutation.isPending && startPhoneVerificationMutation.variables?.channel === "sms"}
                      isVerified={isSmsVerified}
                      isVerificationOpen={verificationPanelOpen.sms}
                      message="Use this number for text message alerts."
                      onPhoneNumberChange={(value) =>
                        setPreferenceForm((current) => ({ ...current, smsPhoneNumber: value }))
                      }
                      onCodeChange={(value) => updateVerificationCode("sms", value)}
                      onClearVerification={() => void clearPhoneVerification("sms")}
                      onCloseVerification={() => closePhoneVerificationPanel("sms")}
                      onDeleteNumber={() => setPendingDeleteChannel("sms")}
                      onSaveNumber={() => void handleSaveChannelPhoneNumber("sms")}
                      onSend={() => void startPhoneVerification("sms")}
                      onVerify={() => void checkPhoneVerification("sms")}
                      phoneNumber={preferenceForm.smsPhoneNumber}
                      phoneNumberLabel="SMS phone number"
                      saveNumberLabel="Save"
                      title="SMS"
                    />
                    <PhoneVerificationCard
                      code={verificationCodes.call}
                      codeLabel="Voice call code"
                      currentPhoneNumber={currentUser.notification_settings.contacts.voice_phone_number ?? "not configured"}
                      disabled={!hasVoicePhoneNumber}
                      isDeletingNumber={updatePreferencesMutation.isPending && updatePreferencesMutation.variables?.voice_phone_number === null}
                      isSavingNumber={updatePreferencesMutation.isPending && typeof updatePreferencesMutation.variables?.voice_phone_number === "string"}
                      isClearingVerification={updatePreferencesMutation.isPending && updatePreferencesMutation.variables?.voice_verified === false}
                      isChecking={checkPhoneVerificationMutation.isPending && checkPhoneVerificationMutation.variables?.channel === "call"}
                      isSending={startPhoneVerificationMutation.isPending && startPhoneVerificationMutation.variables?.channel === "call"}
                      isVerified={isVoiceVerified}
                      isVerificationOpen={verificationPanelOpen.call}
                      message="Use this number for automated voice call alerts."
                      onPhoneNumberChange={(value) =>
                        setPreferenceForm((current) => ({ ...current, voicePhoneNumber: value }))
                      }
                      onCodeChange={(value) => updateVerificationCode("call", value)}
                      onClearVerification={() => void clearPhoneVerification("call")}
                      onCloseVerification={() => closePhoneVerificationPanel("call")}
                      onDeleteNumber={() => setPendingDeleteChannel("call")}
                      onSaveNumber={() => void handleSaveChannelPhoneNumber("call")}
                      onSend={() => void startPhoneVerification("call")}
                      onVerify={() => void checkPhoneVerification("call")}
                      phoneNumber={preferenceForm.voicePhoneNumber}
                      phoneNumberLabel="Voice phone number"
                      saveNumberLabel="Save"
                      title="Voice call"
                    />
                  </div>
                </section>
                {phoneVerificationStartError ? (
                  <StateBlock
                    message={phoneVerificationStartError.message}
                    title={phoneVerificationStartError.title}
                    tone="danger"
                  />
                ) : null}
                {checkPhoneVerificationMutation.error ? (
                  <ErrorState error={checkPhoneVerificationMutation.error} title="Could not verify phone" />
                ) : null}
                {updatePreferencesMutation.error ? (
                  <ErrorState error={updatePreferencesMutation.error} title="Could not save phone number" />
                ) : null}
                {settingsNotice ? <div aria-live="polite" className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs text-[#72e09c]" role="status">{settingsNotice}</div> : null}
              </>
            ) : (
              <EmptyState message="The signed-in user could not be found." title="No account" />
            )}
          </div>
        ) : null}

        {activeTab === "preferences" ? (
          <div aria-labelledby="user-settings-tab-preferences" className="grid gap-4 min-w-0" id="user-settings-panel-preferences" role="tabpanel">
            <section className="grid gap-3.5 bg-surface-2 border border-hairline-soft rounded-lg p-3.5 max-w-xl">
              <div className="grid gap-1">
                <h3 className="text-ink text-[17px] font-semibold leading-tight m-0">Language</h3>
                <p className="text-ink-muted text-xs leading-[1.4] m-0">
                  Choose the language used for navigation, settings, labels, and system UI.
                </p>
              </div>
              <LanguageSelect />
            </section>
          </div>
        ) : null}

        {activeTab === "invitations" ? (
          <div aria-labelledby="user-settings-tab-invitations" className="grid gap-4 min-w-0" id="user-settings-panel-invitations" role="tabpanel">
            {myInvitesQuery.isLoading ? (
              <TablePageSkeleton label="Loading invitations" />
            ) : (
              <DataTable
                columns={inviteColumns}
                emptyState={<EmptyState message="No invitations found for this account." title="No invites" />}
                getRowKey={(invite) => invite.id}
                rows={myInvites}
              />
            )}
          </div>
        ) : null}
      </Panel>
      <Dialog
        cancelLabel="Keep number"
        confirmLabel="Delete number"
        description={pendingDeleteChannel === "sms"
          ? "This removes the saved SMS number and disables SMS delivery until a new number is verified."
          : "This removes the saved voice number and disables phone delivery until a new number is verified."}
        isConfirming={updatePreferencesMutation.isPending}
        onClose={() => setPendingDeleteChannel(null)}
        onConfirm={() => pendingDeleteChannel && void deletePhoneNumber(pendingDeleteChannel)}
        open={pendingDeleteChannel !== null}
        title="Delete notification number?"
        tone="danger"
      />
      </section>
    </LocalizedText>
  );
}

function createInviteColumns({
  acceptingId,
  decliningId,
  isAccepting,
  isDeclining,
  onAccept,
  onDecline,
}: {
  acceptingId: string | undefined;
  decliningId: string | undefined;
  isAccepting: boolean;
  isDeclining: boolean;
  onAccept: (invite: WorkspaceInvite) => void;
  onDecline: (invite: WorkspaceInvite) => void;
}): Array<DataTableColumn<WorkspaceInvite>> {
  return [
    {
      header: "Project",
      key: "project",
      render: (invite) => (
        <div className="grid gap-1 min-w-45">
          <strong className="text-ink text-sm font-[650] leading-[1.3]">{invite.workspace_name}</strong>
          <span className="text-ink-subtle font-mono text-xs leading-[1.35] block">{invite.role}</span>
        </div>
      ),
    },
    {
      header: "Status",
      key: "status",
      render: (invite) => (
        <Badge tone={invite.status === "pending" ? "yellow" : invite.status === "accepted" ? "green" : "neutral"}>
          {invite.status}
        </Badge>
      ),
      width: 110,
    },
    {
      header: "Expires",
      key: "expires",
      render: (invite) => formatDateTime(invite.expires_at),
      width: 160,
    },
    {
      header: "Actions",
      key: "actions",
      render: (invite) =>
        invite.status === "pending" ? (
          <div className="flex items-center flex-wrap gap-2">
            <Button
              disabled={isAccepting && acceptingId === invite.id}
              isLoading={isAccepting && acceptingId === invite.id}
              onClick={() => onAccept(invite)}
              size="sm"
              variant="primary"
            >
              Accept
            </Button>
            <Button
              disabled={isDeclining && decliningId === invite.id}
              isLoading={isDeclining && decliningId === invite.id}
              onClick={() => onDecline(invite)}
              size="sm"
              variant="ghost"
            >
              Decline
            </Button>
          </div>
        ) : "-",
      width: 170,
    },
  ];
}

function NotificationContactRow({
  action,
  label,
  status,
  value,
}: {
  action?: React.ReactNode;
  label: string;
  status: "missing" | "ready" | "unverified" | "verified";
  value: string;
}) {
  const tone = status === "ready" || status === "verified" ? "green" : status === "unverified" ? "yellow" : "neutral";

  return (
    <div className="border border-hairline-soft rounded-md flex flex-wrap items-center justify-between gap-2 min-w-0 p-2.5">
      <div className="grid gap-0.5 min-w-0">
        <strong className="text-ink text-[13px] font-[650] leading-tight">{label}</strong>
        <span className="text-ink-muted font-mono text-xs leading-[1.35] truncate">{value}</span>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Badge tone={tone}>{status}</Badge>
        {action}
      </div>
    </div>
  );
}

function PhoneVerificationCard({
  code,
  codeLabel,
  currentPhoneNumber,
  disabled,
  isDeletingNumber,
  isClearingVerification,
  isSavingNumber,
  isChecking,
  isSending,
  isVerified,
  isVerificationOpen,
  message,
  onCodeChange,
  onClearVerification,
  onCloseVerification,
  onDeleteNumber,
  onPhoneNumberChange,
  onSaveNumber,
  onSend,
  onVerify,
  phoneNumber,
  phoneNumberLabel,
  saveNumberLabel,
  title,
}: {
  code: string;
  codeLabel: string;
  currentPhoneNumber: string;
  disabled: boolean;
  isDeletingNumber: boolean;
  isClearingVerification: boolean;
  isSavingNumber: boolean;
  isChecking: boolean;
  isSending: boolean;
  isVerified: boolean;
  isVerificationOpen: boolean;
  message: string;
  onCodeChange: (value: string) => void;
  onClearVerification: () => void;
  onCloseVerification: () => void;
  onDeleteNumber: () => void;
  onPhoneNumberChange: (value: string) => void;
  onSaveNumber: () => void;
  onSend: () => void;
  onVerify: () => void;
  phoneNumber: string;
  phoneNumberLabel: string;
  saveNumberLabel: string;
  title: string;
}) {
  const canVerify = !disabled && !isVerified;
  const canClearVerification = !disabled && isVerified;

  return (
    <article className="grid content-start gap-3 rounded-lg border border-hairline-soft bg-surface-2 p-3.5">
      <div className="grid gap-1 min-w-0">
        <h4 className="m-0 text-ink text-[15px] font-[650] leading-tight">{title}</h4>
        <p className="m-0 text-ink-muted text-xs leading-[1.4]">{message}</p>
      </div>

      <NotificationContactRow
        action={!disabled ? (
          <>
            {canVerify || canClearVerification ? (
              <Button
                className="!min-h-7 !rounded-md !px-2.5 !text-xs"
                disabled={canVerify ? isChecking || isDeletingNumber : isSending || isChecking || isDeletingNumber}
                isLoading={canVerify ? isSending : isClearingVerification}
                onClick={canVerify ? onSend : onClearVerification}
                size="sm"
                type="button"
                variant="ghost"
              >
                {canVerify ? "Verify" : "Unverify"}
              </Button>
            ) : null}
            <Button
              className="!min-h-7 !rounded-md !px-2.5 !text-xs"
              disabled={isSending || isChecking || isClearingVerification}
              isLoading={isDeletingNumber}
              onClick={onDeleteNumber}
              size="sm"
              type="button"
              variant="danger"
            >
              Delete
            </Button>
          </>
        ) : undefined}
        label="Saved number"
        status={disabled ? "missing" : isVerified ? "verified" : "unverified"}
        value={currentPhoneNumber}
      />

      <Field label={phoneNumberLabel} hint="Use E.164 format, for example +15550101001.">
        <TextInput
          disabled={isSavingNumber}
          onChange={(event) => onPhoneNumberChange(event.target.value)}
          placeholder="+15550101001"
          value={phoneNumber}
        />
      </Field>

      <div className="flex justify-end">
        <Button
          disabled={!phoneNumber.trim() || isSavingNumber}
          isLoading={isSavingNumber}
          onClick={onSaveNumber}
          type="button"
          variant="secondary"
        >
          {saveNumberLabel}
        </Button>
      </div>

      {isVerificationOpen && canVerify ? (
        <div className="grid gap-3 rounded-md border border-hairline-soft bg-surface-1/55 p-3">
          <Field label={codeLabel}>
            <TextInput
              disabled={disabled || isChecking}
              onChange={(event) => onCodeChange(event.target.value)}
              value={code}
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={isChecking}
              onClick={onCloseVerification}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={disabled || isChecking}
              isLoading={isSending}
              onClick={onSend}
              size="sm"
              type="button"
              variant="ghost"
            >
              Resend code
            </Button>
            <Button
              disabled={disabled || !code.trim()}
              isLoading={isChecking}
              onClick={onVerify}
              size="sm"
              type="button"
              variant="primary"
            >
              Confirm code
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function NotificationChannelCard({
  disabled,
  isReady,
  onChange,
  preference,
  readinessMessage,
}: {
  disabled: boolean;
  isReady: boolean;
  onChange: (patch: Partial<UserNotificationChannelPreference>) => void;
  preference: UserNotificationChannelPreference;
  readinessMessage: string;
}) {
  const detail = channelDetails[preference.channel];
  const isEnabled = preference.enabled && isReady;
  const statusLabel = isReady ? (isEnabled ? "enabled" : "off") : "needs setup";
  const statusTone = isReady ? (isEnabled ? "green" : "neutral") : "yellow";

  return (
    <article className="bg-surface-2 border border-hairline-soft rounded-lg grid content-start gap-3 min-w-0 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1 min-w-0">
          <h4 className="text-ink text-[15px] font-[650] leading-tight m-0">{detail.title}</h4>
          <p className="text-ink-muted text-xs leading-[1.4] m-0">{detail.description}</p>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>
      <CheckboxField
        checked={isEnabled}
        description={readinessMessage}
        disabled={disabled || !isReady}
        label={`Enable ${detail.title}`}
        onChange={(event) => onChange({ enabled: event.target.checked })}
      />
      <Field label="Delay seconds" hint="Wait this long before using this route.">
        <NumberInput
          disabled={disabled || !isReady}
          min={0}
          onChange={(event) => onChange({ delay_seconds: Number(event.target.value) })}
          value={preference.delay_seconds}
        />
      </Field>
    </article>
  );
}

function formatChannelReadiness(
  channel: PreferenceChannel,
  user: User,
  form: PreferenceFormState,
  verification: { sms: boolean; voice: boolean },
) {
  if (channel === "email") {
    return `Uses ${user.email}`;
  }

  if (channel === "sms") {
    const phone = user.notification_settings.contacts.sms_phone_number_masked;

    if (verification.sms) {
      return phone ? `${phone} is verified for SMS.` : "SMS verification is complete.";
    }

    if (user.notification_settings.contacts.has_sms_phone_number || form.smsPhoneNumber.trim()) {
      return "Verify SMS before enabling this route.";
    }

    return "Add and verify an SMS phone number first.";
  }

  const phone = user.notification_settings.contacts.voice_phone_number_masked;

  if (verification.voice) {
    return phone ? `${phone} is verified for voice calls.` : "Voice call verification is complete.";
  }

  if (user.notification_settings.contacts.has_voice_phone_number || form.voicePhoneNumber.trim()) {
    return "Verify voice calls before enabling this route.";
  }

  return "Add and verify a voice phone number first.";
}

function formatPhoneVerificationStartError(error: unknown): { message: string; title: string } | null {
  if (!error) return null;

  const code = readErrorStringProperty(error, "code");
  const status = readErrorNumberProperty(error, "status");
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const isTwilioConfigurationError = code === "twilio_phone_verification_not_configured"
    || code === "twilio_phone_verification_failed"
    || (code === "internal_server_error" && /internal server error/i.test(message))
    || /twilio/i.test(message);

  if (isTwilioConfigurationError || status === 500 || status === 502 || status === 503) {
    return {
      title: "Twilio settings need attention",
      message: "Twilio is not configured or the saved Twilio credentials/phone number are invalid. Check Project settings > Twilio.",
    };
  }

  return {
    title: "Could not start verification",
    message: message || "The request could not be completed.",
  };
}

function readErrorStringProperty(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

function readErrorNumberProperty(error: unknown, key: string): number | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];

  return typeof value === "number" ? value : null;
}
