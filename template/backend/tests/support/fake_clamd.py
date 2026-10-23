"""Stand-in for clamd's INSTREAM over real TCP, for the attachment scan's tests."""

import socket
import socketserver
import struct
import threading


class FakeClamd:
    """A clamd that answers each INSTREAM with `reply`, keeping the bytes it was streamed."""

    def __init__(self, reply: bytes) -> None:
        self.reply = reply
        self.streams: list[bytes] = []
        outer = self

        class Handler(socketserver.BaseRequestHandler):
            def handle(self) -> None:
                sock: socket.socket = self.request
                reader = sock.makefile("rb")
                assert reader.read(len(b"zINSTREAM\0")) == b"zINSTREAM\0"
                streamed = b""
                while (size := struct.unpack(">I", reader.read(4))[0]) > 0:
                    streamed += reader.read(size)
                outer.streams.append(streamed)
                sock.sendall(outer.reply)

        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.port: int = self.server.server_address[1]

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
