/** @file Renders an interactive button displaying the status of a project. */
import * as react from "react";
import * as heroicons from "@heroicons/react/24/outline";
import * as reactDom from "react-dom";

import * as auth from "../../authentication/providers/auth";
import * as backend from "../service";
import * as loggerProvider from "../../providers/logger";

// =================
// === Constants ===
// =================

const STATUS_CHECK_INTERVAL = 10000;

const PLAY_ICON = (
    <svg
        width={36}
        height={36}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="m10.04 7.34 6 3.85a1 1 0 0 1 0 1.68l-6 3.85a1 1 0 0 1-1.54-.84v-7.7a1 1 0 0 1 1.54-.84Z"
            fill="currentColor"
        />
        <rect
            x={1.5}
            y={1.5}
            width={21}
            height={21}
            rx={10.5}
            stroke="#3E515F"
            strokeOpacity={0.1}
            strokeWidth={3}
        />
    </svg>
);

// =================
// === Component ===
// =================

interface Props {
    project: backend.ListedProject;
    onOpen: () => void;
    onOpenStart: () => void;
    onClose: () => void;
}

const ProjectActionButton = (props: Props) => {
    const { accessToken } = auth.useFullUserSession();
    const logger = loggerProvider.useLogger();
    const backendService = backend.createBackend(accessToken, logger);
    const { project, onOpen, onOpenStart, onClose } = props;
    const [checkStatusInterval, setCheckStatusInterval] = react.useState<
        number | undefined
    >(undefined);
    const [hasProjectOpened, setHasProjectOpened] = react.useState(false);

    const handleCloseProject = async () => {
        await backendService.closeProject(project.projectId);

        reactDom.unstable_batchedUpdates(() => {
            setCheckStatusInterval(undefined);
            clearInterval(checkStatusInterval);
            onClose();
        });
    };

    const handleOpenProject = async () => {
        await backendService.openProject(project.projectId);

        const checkProjectStatus = async () => {
            const response = await backendService.getProjectDetails(
                project.projectId
            );

            if (response.state.type === backend.ProjectState.opened) {
                setHasProjectOpened(true);
                setCheckStatusInterval(undefined);
                clearInterval(checkStatusInterval);
                onOpen();
            }
        };

        const newCheckStatusInterval = window.setInterval(
            () => void checkProjectStatus(),
            STATUS_CHECK_INTERVAL
        );

        reactDom.unstable_batchedUpdates(() => {
            setCheckStatusInterval(newCheckStatusInterval);
            onOpenStart();
        });
    };

    switch (project.state.type) {
        case backend.ProjectState.created:
        case backend.ProjectState.new:
        case backend.ProjectState.closed:
            return <button onClick={handleOpenProject}>{PLAY_ICON}</button>;
        case backend.ProjectState.openInProgress:
            if (!checkStatusInterval && accessToken) {
                const checkProjectStatus = async () => {
                    const response = await backendService.getProjectDetails(
                        project.projectId
                    );

                    if (response.state.type === backend.ProjectState.opened) {
                        setHasProjectOpened(true);
                        setCheckStatusInterval(undefined);
                        clearInterval(checkStatusInterval);
                        onOpen();
                    }
                };

                const newCheckStatusInterval = window.setInterval(
                    () => void checkProjectStatus(),
                    STATUS_CHECK_INTERVAL
                );

                reactDom.unstable_batchedUpdates(() => {
                    setCheckStatusInterval(newCheckStatusInterval);
                    onOpenStart();
                });
            }

            return (
                <>
                    <svg
                        aria-hidden="true"
                        className="mr-2 w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
                        viewBox="0 0 100 101"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                            fill="currentColor"
                        />
                        <path
                            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                            fill="currentFill"
                        />
                    </svg>

                    <button onClick={handleCloseProject}>
                        <heroicons.StopCircleIcon className="h-10 w-10 text-grey-500" />
                    </button>
                </>
            );
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        case backend.ProjectState.opened || hasProjectOpened:
            return (
                <>
                    <button onClick={handleCloseProject}>
                        <heroicons.StopCircleIcon className="h-10 w-10 text-grey-500" />
                    </button>

                    <a href={`ide/${project.projectId}`}>
                        <heroicons.ArrowRightIcon className="h-10 w-10 text-grey-500" />
                    </a>
                </>
            );
    }
};

export default ProjectActionButton;
