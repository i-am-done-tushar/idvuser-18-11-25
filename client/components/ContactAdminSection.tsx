import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function ContactAdminSection() {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    setFile(f || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setSuccessMessage(null);

    try {
      // Placeholder: integrate with backend later
      await new Promise((res) => setTimeout(res, 600));

      // Show toast and inline success message
      toast({ title: "Your request has been sent. Admin will respond shortly.", duration: 5000 });
      setSuccessMessage("Your request has been sent. Admin will respond shortly.");

      // Reset form
      setSubject("");
      setMessage("");
      setFile(null);
    } catch (err) {
      toast({ title: "Failed to send request", description: "Please try again later.", duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-text-primary font-roboto text-[22px] font-bold leading-[30px]">Contact Administrator</h1>
        <p className="text-text-muted font-roboto text-[13px] font-normal leading-[15px]">
          For any questions regarding your verification or account, please contact your administrator through this form.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl w-full bg-white border border-input-border rounded-lg p-6">
        {successMessage && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 text-green-800 rounded">{successMessage}</div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input-border px-3 py-2 text-sm"
            placeholder="Subject"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input-border px-3 py-2 text-sm"
            rows={6}
            placeholder="Describe your issue or question"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text-muted">Attachment (optional)</label>
          <input type="file" onChange={handleFileChange} className="mt-1 text-sm" />
          {file && <div className="text-text-muted text-sm mt-2">Selected file: {file.name}</div>}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !subject.trim() || !message.trim()}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send Request"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSubject("");
              setMessage("");
              setFile(null);
            }}
            className="px-4 py-2 rounded-md bg-white border border-input-border text-sm"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
