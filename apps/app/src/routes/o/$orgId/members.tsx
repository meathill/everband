import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { RELATIONSHIPS, STUDENT_STATUS_VALUES } from "@everband/validation";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  createStudent,
  inviteParent,
  listGroups,
  listStudents,
  updateStudentStatus,
} from "~/server/members.ts";

export const Route = createFileRoute("/o/$orgId/members")({
  loader: async ({ params }) => {
    try {
      const [students, groups] = await Promise.all([
        listStudents({ data: { orgId: params.orgId } }),
        listGroups({ data: { orgId: params.orgId } }),
      ]);
      return { students, groups };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: MembersPage,
});

type Students = Awaited<ReturnType<typeof listStudents>>;
type Groups = Awaited<ReturnType<typeof listGroups>>;

function MembersPage() {
  const { students, groups } = Route.useLoaderData();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Members</h1>
      </div>
      <AddStudentForm groups={groups} />
      <StudentsTable students={students} groups={groups} />
    </div>
  );
}

function AddStudentForm({ groups }: { groups: Groups }) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await createStudent({
        data: {
          orgId,
          name: String(form.get("studentName")),
          status: String(form.get("status")) as (typeof STUDENT_STATUS_VALUES)[number],
          groupId: String(form.get("groupId")) || undefined,
          contact: {
            name: String(form.get("contactName")),
            email: String(form.get("contactEmail")),
            relationship: String(form.get("relationship")) as (typeof RELATIONSHIPS)[number],
          },
        },
      });
      if (result.ok) {
        setIsOpen(false);
        await router.invalidate();
      } else {
        setError(result.error);
      }
    } finally {
      setIsBusy(false);
    }
  }

  if (!isOpen) {
    return (
      <div>
        <Button onClick={() => setIsOpen(true)}>Add student</Button>
      </div>
    );
  }

  const selectClass =
    "h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm";

  return (
    <form
      onSubmit={handleSubmit}
      className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-foreground">New student</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5" htmlFor="student-name">
          <span className="text-sm font-medium text-foreground">Student name</span>
          <Input id="student-name" name="studentName" required />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="student-status">
          <span className="text-sm font-medium text-foreground">Status</span>
          <select id="student-status" name="status" defaultValue="active" className={selectClass}>
            {STUDENT_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="student-group">
          <span className="text-sm font-medium text-foreground">Group</span>
          <select id="student-group" name="groupId" className={selectClass} defaultValue="">
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5" htmlFor="contact-name">
          <span className="text-sm font-medium text-foreground">Contact name</span>
          <Input id="contact-name" name="contactName" required />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="contact-email">
          <span className="text-sm font-medium text-foreground">Contact email</span>
          <Input id="contact-email" name="contactEmail" type="email" required />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="contact-relationship">
          <span className="text-sm font-medium text-foreground">Relationship</span>
          <select
            id="contact-relationship"
            name="relationship"
            defaultValue="parent"
            className={selectClass}
          >
            {RELATIONSHIPS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={isBusy}>
          Create student
        </Button>
        <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function StudentsTable({ students, groups }: { students: Students; groups: Groups }) {
  const { orgId } = Route.useParams();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function handleStatusChange(studentId: string, status: string, groupId: string | null) {
    setMessage(null);
    const result = await updateStudentStatus({
      data: {
        orgId,
        studentId,
        status: status as (typeof STUDENT_STATUS_VALUES)[number],
        groupId: groupId ?? undefined,
      },
    });
    if (!result.ok) {
      setMessage(result.error);
    }
    await router.invalidate();
  }

  async function handleInviteParent(contactId: string) {
    setMessage(null);
    const result = await inviteParent({ data: { orgId, contactId } });
    setMessage(result.ok ? "Invitation sent." : result.error);
  }

  if (students.length === 0) {
    return <p className="text-muted-foreground">No students yet. Add one above or import a CSV.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Student</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Group</th>
              <th className="py-2 font-medium">Contacts</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-b border-border align-top">
                <td className="py-2 pr-4 font-medium text-foreground">{student.name}</td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Status for ${student.name}`}
                    className="h-8 rounded-md border border-input bg-popover px-2 text-sm text-foreground"
                    value={student.status}
                    onChange={(e) =>
                      handleStatusChange(student.id, e.target.value, student.groupId)
                    }
                  >
                    {STUDENT_STATUS_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Group for ${student.name}`}
                    className="h-8 rounded-md border border-input bg-popover px-2 text-sm text-foreground"
                    value={student.groupId ?? ""}
                    onChange={(e) =>
                      handleStatusChange(student.id, student.status, e.target.value || null)
                    }
                  >
                    <option value="">No group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <ul className="flex flex-col gap-1">
                    {student.contacts.map((contact) => (
                      <li key={contact.contactId} className="flex items-center gap-2">
                        <span className="text-foreground">{contact.contactName}</span>
                        <span className="text-muted-foreground">{contact.contactEmail}</span>
                        <span className="text-xs text-muted-foreground">
                          ({contact.relationship})
                        </span>
                        {contact.contactUserId ? (
                          <span className="text-xs font-semibold tracking-wide text-success-foreground uppercase">
                            linked
                          </span>
                        ) : (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleInviteParent(contact.contactId)}
                          >
                            Invite parent
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
