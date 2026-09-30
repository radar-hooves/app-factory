/**
 * `ReportWidget`'s contract: the trigger, the dialogue's labelled fields, and
 * above all the POST — asserted on the exact payload the endpoint receives,
 * because that body IS the interface the server side is written against.
 *
 * `html-to-image` and `$lib/telemetry` are mocked so the payload's `screenshot`
 * and `session_id` legs are deterministic, and so the widget's behaviour on
 * the legs where those collaborators would fail is driven directly: a page
 * whose screenshot cannot be captured still submits, and an unconfigured
 * telemetry module still submits, with nulls rather than errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { toPng } from 'html-to-image';
import ReportWidget from '$lib/components/feedback/report-widget.svelte';
import { getSessionId } from '$lib/telemetry';

vi.mock('html-to-image', () => ({ toPng: vi.fn() }));
vi.mock('$lib/telemetry', () => ({ getSessionId: vi.fn(() => 'faro-session-1') }));

/** A fetch that answers `{ id }` like the endpoint contract says. */
function okFetch(id = 'fb-1234') {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve({ id })
	});
}

/** Open the dialogue and fill in a message. */
async function openAndType(text = 'The sparkline renders upside down') {
	render(ReportWidget);
	await fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
	const textarea = screen.getByLabelText('What happened?');
	await fireEvent.input(textarea, { target: { value: text } });
	return textarea;
}

/** The parsed body of the one POST the widget has made so far. */
function postedBody(fetchMock: ReturnType<typeof okFetch>) {
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
	expect(url).toBe('/api/feedback');
	expect(init.method).toBe('POST');
	return JSON.parse(init.body as string);
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('ReportWidget — the trigger and the dialogue', () => {
	it('renders a floating trigger that opens the labelled report dialogue', async () => {
		render(ReportWidget);

		const trigger = screen.getByRole('button', { name: 'Report a problem' });
		await fireEvent.click(trigger);

		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByLabelText('What happened?')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Report a problem' })).toBeInTheDocument();
	});

	it('offers the screenshot checkbox, checked by default', async () => {
		render(ReportWidget);
		await fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

		const checkbox = screen.getByRole('checkbox', {
			name: 'Include a screenshot of this page'
		});
		expect(checkbox).toBeChecked();
	});

	it('does not offer to send while the message is empty', async () => {
		const fetchMock = okFetch();
		vi.stubGlobal('fetch', fetchMock);
		render(ReportWidget);
		await fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));

		// The guard is the disabled control itself: an empty report cannot be
		// submitted, so no POST can leave the page with no message in it.
		expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('ReportWidget — the POST', () => {
	it('submits exactly the payload shape to the endpoint', async () => {
		vi.mocked(toPng).mockResolvedValue('data:image/png;base64,SCREEN');
		const fetchMock = okFetch();
		vi.stubGlobal('fetch', fetchMock);

		await openAndType();
		await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(postedBody(fetchMock)).toEqual({
			message: 'The sparkline renders upside down',
			route: location.pathname,
			user_agent: navigator.userAgent,
			viewport: { width: window.innerWidth, height: window.innerHeight },
			session_id: 'faro-session-1',
			screenshot: 'data:image/png;base64,SCREEN'
		});
		// The capture is of the whole page, and it happens because the
		// checkbox said so — not because a screenshot is unconditional.
		expect(toPng).toHaveBeenCalledWith(document.body);
	});

	it('honours a custom endpoint', async () => {
		vi.mocked(toPng).mockResolvedValue(null as unknown as string);
		const fetchMock = okFetch();
		vi.stubGlobal('fetch', fetchMock);

		render(ReportWidget, { props: { endpoint: '/api/support-ticket' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
		await fireEvent.input(screen.getByLabelText('What happened?'), {
			target: { value: 'Anything' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(fetchMock.mock.calls[0][0]).toBe('/api/support-ticket');
	});

	it('skips the capture entirely when the checkbox is unchecked', async () => {
		const fetchMock = okFetch();
		vi.stubGlobal('fetch', fetchMock);

		await openAndType();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Include a screenshot of this page' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(toPng).not.toHaveBeenCalled();
		expect(postedBody(fetchMock).screenshot).toBeNull();
	});

	it('tolerates a failed screenshot silently: the report sends with a null image', async () => {
		vi.mocked(toPng).mockRejectedValue(new Error('canvas tainted'));
		const fetchMock = okFetch();
		vi.stubGlobal('fetch', fetchMock);

		await openAndType();
		await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		expect(postedBody(fetchMock).screenshot).toBeNull();
	});
});

describe('ReportWidget — the states', () => {
	it('shows the returned id and a thank-you on success, and fires onSubmitted', async () => {
		vi.mocked(toPng).mockResolvedValue('data:image/png;base64,SCREEN');
		const fetchMock = okFetch('fb-9999');
		vi.stubGlobal('fetch', fetchMock);
		const onSubmitted = vi.fn();
		render(ReportWidget, { props: { onSubmitted } });

		await fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }));
		await fireEvent.input(screen.getByLabelText('What happened?'), {
			target: { value: 'The dialogue swallows the Escape key' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

		await waitFor(() =>
			expect(screen.getByTestId('feedback-done')).toBeInTheDocument()
		);
		expect(screen.getByText('fb-9999')).toBeInTheDocument();
		expect(screen.getByText(/thank you/i)).toBeInTheDocument();
		expect(onSubmitted).toHaveBeenCalledWith('fb-9999');
		expect(getSessionId).toHaveBeenCalled();
	});

	it('shows an error with a retry when the endpoint answers badly, and the retry sends again', async () => {
		vi.mocked(toPng).mockResolvedValue('data:image/png;base64,SCREEN');
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
			.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'fb-7777' }) });
		vi.stubGlobal('fetch', fetchMock);

		await openAndType();
		await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

		await waitFor(() => expect(screen.getByTestId('feedback-error')).toBeInTheDocument());
		expect(screen.getByText(/could not be sent/i)).toBeInTheDocument();

		// The draft survives the failure — the retry sends the same message,
		// which the second POST's body proves.
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		await waitFor(() => expect(screen.getByTestId('feedback-done')).toBeInTheDocument());
		expect(screen.getByText('fb-7777')).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).message).toBe(
			'The sparkline renders upside down'
		);
	});
});
